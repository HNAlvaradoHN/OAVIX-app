import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const fragments = () => [
  'src/app-shell/navigation.html',
  'src/features/dashboard/view.html',
  'src/features/maintenance/view.html',
  'src/features/maintenance/overlays.html'
].map(read).join('\n');

function memoryStorage(limit = Number.POSITIVE_INFINITY) {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(String(key)) ?? null,
    setItem(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      const total = [...values.entries()].reduce(
        (sum, [storedKey, storedValue]) =>
          sum + (storedKey === normalizedKey ? 0 : storedKey.length + storedValue.length),
        normalizedKey.length + normalizedValue.length
      );
      if (total > limit) {
        const error = new Error('Storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(normalizedKey, normalizedValue);
    },
    removeItem: key => values.delete(String(key))
  };
}

function loadMaintenanceContext({ storage = memoryStorage(), documentValue = document, extras = {} } = {}) {
  const context = createContext({
    console,
    Date,
    JSON,
    Number,
    String,
    document: documentValue,
    localStorage: storage,
    setTimeout: () => 1,
    clearTimeout: () => {},
    ...extras
  });
  context.window = context;

  for (const path of [
    'src/core/utils.js',
    'src/core/state.js',
    'src/core/storage.js',
    'src/features/maintenance/controller.js'
  ]) {
    new Script(read(path), { filename: path }).runInContext(context);
  }

  return context;
}

describe('maintenance photos', () => {
  it('reduces a large photo before storing it', async () => {
    document.body.innerHTML = fragments();
    const canvases = [];
    const documentProxy = new Proxy(document, {
      get(target, property) {
        if (property === 'createElement') {
          return tag => {
            if (tag !== 'canvas') return target.createElement(tag);
            const canvas = {
              width: 0,
              height: 0,
              getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {}
              }),
              toDataURL(type, quality) {
                const bytes = Math.ceil(this.width * this.height * quality * 0.18);
                return `data:${type};base64,${'A'.repeat(Math.ceil(bytes * 4 / 3))}`;
              }
            };
            canvases.push(canvas);
            return canvas;
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    let released = false;
    const context = loadMaintenanceContext({
      documentValue: documentProxy,
      extras: { releaseDecodedPhoto: () => { released = true; } }
    });
    context.photoFile = { type: 'image/jpeg', size: 8 * 1024 * 1024 };
    new Script(`
      decodeMaintenanceImage = async () => ({
        image: { naturalWidth: 4000, naturalHeight: 3000 },
        release: releaseDecodedPhoto
      });
    `).runInContext(context);

    const optimized = await new Script('compressMaintenanceImage(photoFile)').runInContext(context);
    const optimizedBytes = new Script('maintenanceImageBytes(optimizedPhoto)').runInContext(
      Object.assign(context, { optimizedPhoto: optimized })
    );

    expect(optimized).toMatch(/^data:image\/webp;base64,/);
    expect(optimizedBytes).toBeLessThanOrEqual(180 * 1024);
    expect(canvases[0]).toMatchObject({ width: 1280, height: 960 });
    expect(released).toBe(true);
  });

  it('shows progress and enables save only after optimization finishes', async () => {
    document.body.innerHTML = fragments();
    const context = loadMaintenanceContext();
    context.photoFile = { type: 'image/jpeg', size: 8 * 1024 * 1024 };
    context.photoInput = { files: [context.photoFile], value: 'photo.jpg' };
    new Script(`
      compressMaintenanceImage = async () =>
        'data:image/webp;base64,' + 'A'.repeat(8000);
      showToast = () => {};
    `).runInContext(context);

    await new Script('previewImageFile({ target: photoInput })').runInContext(context);

    expect(document.getElementById('record-submit-button').disabled).toBe(false);
    expect(document.getElementById('photo-preview-container').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('photo-processing-status').textContent).toContain('Foto optimizada');
    expect(document.getElementById('photo-processing-status').textContent).toContain('8.0 MB');
    expect(new Script('currentBase64Image.startsWith("data:image/webp")').runInContext(context)).toBe(true);
  });

  it('keeps the form and previous data intact if storage is still full', () => {
    document.body.innerHTML = fragments();
    const storage = memoryStorage(5000);
    const toasts = [];
    const quietConsole = { ...console, error: () => {} };
    const context = loadMaintenanceContext({
      storage,
      extras: {
        console: quietConsole,
        switchSubTab: () => {},
        renderStats: () => {},
        renderArchiveRecords: () => {},
        renderMileageComparison: () => {},
        renderCalendar: () => {},
        renderAlerts: () => {},
        showToast: (...args) => toasts.push(args)
      }
    });

    new Script('setupCategoryDropdowns(); openFormModal();').runInContext(context);
    document.getElementById('form-title').value = 'Mantenimiento con foto';
    document.getElementById('form-amount').value = '850';
    document.getElementById('form-date').value = '2026-08-13';
    new Script(`
      currentBase64Image = 'data:image/webp;base64,' + 'A'.repeat(10000);
      handleFormSubmit({ preventDefault() {} });
    `).runInContext(context);

    expect(new Script('autoRecords.length').runInContext(context)).toBe(0);
    expect(storage.getItem('oavix_auto_records')).toBeNull();
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('form-title').value).toBe('Mantenimiento con foto');
    expect(toasts.at(-1)[0]).toBe('No se pudo guardar');
    expect(toasts.at(-1)[1]).toContain('datos anteriores siguen intactos');
  });
});
