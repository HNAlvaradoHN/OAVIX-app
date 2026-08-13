import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const controllerPaths = [
  'src/core/utils.js',
  'src/core/state.js',
  'src/core/storage.js',
  'src/ui/toasts/controller.js',
  'src/ui/theme/controller.js',
  'src/features/dashboard/controller.js',
  'src/features/maintenance/controller.js',
  'src/features/archive/controller.js',
  'src/features/calendar/controller.js',
  'src/features/alerts/controller.js',
  'src/features/fuel/controller.js',
  'src/ui/navigation/controller.js',
  'src/core/bootstrap.js'
];

const ownership = {
  'src/features/dashboard/controller.js': ['setDistanceUnit', 'renderMileageComparison', 'renderStats'],
  'src/features/maintenance/controller.js': ['setupCategoryDropdowns', 'renderRecords', 'openFormModal', 'handleFormSubmit'],
  'src/features/archive/controller.js': ['renderArchiveRecords'],
  'src/features/calendar/controller.js': ['renderCalendar', 'openDayEntriesModal', 'changeMonth'],
  'src/features/alerts/controller.js': ['checkScheduledAlarms', 'startContinuousAlarm', 'renderAlerts'],
  'src/features/fuel/controller.js': ['renderFuelModule', 'calculateTankFill', 'refreshFuelPrices'],
  'src/ui/navigation/controller.js': ['switchSubTab'],
  'src/ui/theme/controller.js': ['toggleTheme', 'applyCustomTheme'],
  'src/ui/toasts/controller.js': ['showToast']
};

describe('controller architecture', () => {
  it('loads every controller explicitly and starts bootstrap last', () => {
    const loader = read('src/app.js');

    for (const path of controllerPaths) expect(loader).toContain(`'${path}'`);
    expect(controllerPaths.at(-1)).toBe('src/core/bootstrap.js');
    expect(loader).not.toContain('src/legacy/app.js');
    expect(existsSync(resolve(process.cwd(), 'src/legacy/app.js'))).toBe(false);
  });

  it.each(Object.entries(ownership))('keeps %s responsibilities in that controller', (path, functions) => {
    const source = read(path);

    for (const functionName of functions) {
      expect(source).toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      for (const otherPath of controllerPaths.filter(candidate => candidate !== path)) {
        expect(read(otherPath)).not.toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      }
    }
  });

  it('keeps mutable application state only in the core state module', () => {
    const state = read('src/core/state.js');
    const otherSources = controllerPaths
      .filter(path => path !== 'src/core/state.js')
      .map(read)
      .join('\n');

    for (const variable of ['currentUnit', 'currentVehicleMileage', 'autoCategories', 'autoRecords']) {
      expect(state).toMatch(new RegExp(`let\\s+${variable}\\b`));
      expect(otherSources).not.toMatch(new RegExp(`let\\s+${variable}\\b`));
    }
  });

  it('can evaluate the separated classic controllers in their declared order', () => {
    const storage = new Map();
    const context = createContext({
      console,
      Date,
      JSON,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
      },
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout
    });
    context.window = context;

    for (const path of controllerPaths.filter(path => path !== 'src/core/bootstrap.js')) {
      new Script(read(path), { filename: path }).runInContext(context);
    }

    expect(typeof context.renderCalendar).toBe('function');
    expect(typeof context.renderAlerts).toBe('function');
    expect(typeof context.renderFuelModule).toBe('function');
    expect(new Script('autoRecords.length').runInContext(context)).toBe(0);
  });

  it('initializes the complete interface after all separated controllers load', () => {
    const fragmentPaths = [
      'src/app-shell/navigation.html',
      'src/app-shell/header.html',
      'src/features/dashboard/view.html',
      'src/features/maintenance/view.html',
      'src/features/calendar/view.html',
      'src/features/fuel/view.html',
      'src/features/alerts/view.html',
      'src/features/archive/view.html',
      'src/ui/theme/view.html',
      'src/features/maintenance/overlays.html',
      'src/features/alerts/overlays.html',
      'src/ui/toasts/view.html'
    ];
    document.body.innerHTML = fragmentPaths.map(read).join('\n');

    const storage = new Map();
    const stableDocument = new Proxy(document, {
      get(target, property) {
        if (property === 'readyState') return 'complete';
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    const context = createContext({
      console,
      Date,
      JSON,
      document: stableDocument,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
      },
      setInterval: () => 1,
      clearInterval,
      setTimeout,
      clearTimeout
    });
    context.window = context;

    for (const path of controllerPaths) {
      new Script(read(path), { filename: path }).runInContext(context);
    }

    expect(document.querySelectorAll('#stats-container > *')).toHaveLength(4);
    expect(document.getElementById('records-list').textContent).toContain('Cambio de Aceite Sintético');
    expect(document.getElementById('calendar-month-year').textContent).not.toBe('');
    expect(document.querySelectorAll('.nav-btn')).toHaveLength(6);
  });
});
