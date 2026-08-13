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
  'src/features/dashboard/controller.js': ['setDistanceUnit', 'saveCurrentMileageInput', 'renderMileageComparison', 'renderStats'],
  'src/features/maintenance/controller.js': ['repairMaintenanceCategories', 'setupCategoryDropdowns', 'compressMaintenanceImage', 'previewImageFile', 'renderRecords', 'startNewMaintenance', 'openFormModal', 'handleFormSubmit'],
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
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
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
    expect(document.getElementById('records-list').textContent).toContain('No hay registros activos');
    expect(document.getElementById('calendar-month-year').textContent).not.toBe('');
    expect(document.querySelectorAll('.nav-btn')).toHaveLength(6);
  });

  it('accepts only digits in the main mileage field', () => {
    document.body.innerHTML = `
      <div id="mileage-comparison-list"></div>
      <div id="stats-container"></div>
    `;
    const storage = new Map();
    const context = createContext({
      document,
      JSON,
      Number,
      String,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
      }
    });
    context.window = context;
    context.mileageInput = { value: '12a3,4 km' };

    new Script(read('src/core/utils.js')).runInContext(context);
    new Script(read('src/core/state.js')).runInContext(context);
    new Script(read('src/features/dashboard/controller.js')).runInContext(context);
    new Script('saveCurrentMileageInput(mileageInput)').runInContext(context);

    expect(context.mileageInput.value).toBe('1,234');
    expect(storage.get('oavix_auto_mileage')).toBe('1234');
    expect(new Script('currentVehicleMileage').runInContext(context)).toBe(1234);

    context.mileageInput.value = 'solo letras';
    new Script('saveCurrentMileageInput(mileageInput)').runInContext(context);

    expect(context.mileageInput.value).toBe('');
    expect(storage.get('oavix_auto_mileage')).toBe('0');
    expect(new Script('currentVehicleMileage').runInContext(context)).toBe(0);
  });

  it('uses the numeric keyboard hint without losing thousands formatting', () => {
    const view = new DOMParser().parseFromString(read('src/features/dashboard/view.html'), 'text/html');
    const input = view.getElementById('current-mileage-input');

    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('pattern')).toBe('[0-9,]*');
  });

  it('uses one maintenance form and reveals a newly saved record in its tab', () => {
    document.body.innerHTML = [
      'src/app-shell/navigation.html',
      'src/features/dashboard/view.html',
      'src/features/maintenance/view.html',
      'src/features/maintenance/overlays.html'
    ].map(read).join('\n');

    const storage = new Map();
    const selectedTabs = [];
    const timers = [];
    const context = createContext({
      console,
      Date,
      JSON,
      document,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
      },
      setTimeout: callback => {
        timers.push(callback);
        return timers.length;
      },
      switchSubTab: tab => selectedTabs.push(tab),
      renderStats: () => {},
      renderArchiveRecords: () => {},
      renderMileageComparison: () => {},
      renderCalendar: () => {},
      renderAlerts: () => {},
      showToast: () => {}
    });
    context.window = context;

    new Script(read('src/core/utils.js')).runInContext(context);
    new Script(read('src/core/state.js')).runInContext(context);
    new Script(read('src/core/storage.js')).runInContext(context);
    new Script(read('src/features/maintenance/controller.js')).runInContext(context);
    new Script('setupCategoryDropdowns()').runInContext(context);

    const dashboardButton = document.getElementById('dashboard-new-maintenance-button');
    const maintenanceButton = document.getElementById('maintenance-new-button');
    expect(dashboardButton.getAttribute('onclick')).toBe('startNewMaintenance()');
    expect(maintenanceButton.getAttribute('onclick')).toBe('startNewMaintenance()');
    expect(document.querySelectorAll('#record-form')).toHaveLength(1);

    new Script('startNewMaintenance()').runInContext(context);
    expect(selectedTabs).toEqual(['records']);
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(false);

    document.getElementById('form-title').value = 'Cambio de aceite nuevo';
    document.getElementById('form-amount').value = '950';
    document.getElementById('form-currency').value = 'HNL';
    document.getElementById('form-date').value = '2026-08-13';
    new Script('handleFormSubmit({ preventDefault() {} })').runInContext(context);

    const savedRecords = JSON.parse(storage.get('oavix_auto_records'));
    const firstCard = document.querySelector('[data-maintenance-record-id]');
    expect(selectedTabs).toEqual(['records', 'records']);
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0].title).toBe('Cambio de aceite nuevo');
    expect(firstCard.textContent).toContain('Cambio de aceite nuevo');
    expect(firstCard.classList.contains('maintenance-record-highlight')).toBe(true);
    expect(timers).toHaveLength(1);
  });

  it('recovers an empty category list that the user never managed', () => {
    const storage = new Map([['oavix_auto_categories', '[]']]);
    const context = createContext({
      Date,
      JSON,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
      }
    });
    context.window = context;

    new Script(read('src/core/state.js')).runInContext(context);
    new Script(read('src/features/maintenance/controller.js')).runInContext(context);

    expect(JSON.parse(storage.get('oavix_auto_categories'))).toHaveLength(5);
    expect(storage.get('oavix_auto_categories_initialized')).toBe('true');
  });

  it('preserves an intentionally emptied category list', () => {
    const storage = new Map([
      ['oavix_auto_categories', '[]'],
      ['oavix_auto_categories_initialized', 'true']
    ]);
    const context = createContext({
      Date,
      JSON,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
      }
    });
    context.window = context;

    new Script(read('src/core/state.js')).runInContext(context);
    new Script(read('src/features/maintenance/controller.js')).runInContext(context);

    expect(new Script('autoCategories.length').runInContext(context)).toBe(0);
  });
});
