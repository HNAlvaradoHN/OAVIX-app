(function installFuelStorageGuard(root) {
  'use strict';

  const module = root.FuelModule;
  if (!module || module.__oavixStorageGuardInstalled) return;

  const storageKeys = [
    module.constants?.STORAGE?.vehicles || 'oavix_fuel_vehicles',
    module.constants?.STORAGE?.history || 'oavix_fuel_history',
    module.constants?.STORAGE?.preferences || 'oavix_fuel_preferences',
    module.constants?.STORAGE?.legacyVehicle || 'oavix_fuel_vehicle_config'
  ];
  const runtimeStorage = root.OAVIXSyncInternal?.context?.nativeStorage;
  const direct = runtimeStorage || {
    get: root.localStorage.getItem.bind(root.localStorage),
    set: root.localStorage.setItem.bind(root.localStorage),
    remove: root.localStorage.removeItem.bind(root.localStorage)
  };

  function checkpoint() {
    return storageKeys.map(key => [key, direct.get(key)]);
  }

  function restore(values) {
    values.forEach(([key, value]) => {
      if (value === null) direct.remove(key);
      else direct.set(key, value);
    });
    if (typeof module.reloadLocalState === 'function') module.reloadLocalState();
  }

  function notifyFailure() {
    root.showToast?.(
      'No se pudo guardar',
      'El almacenamiento del dispositivo está lleno o no está disponible. Tus datos anteriores siguen intactos.',
      'rose'
    );
  }

  const mutationMethods = [
    'setActiveVehicle',
    'saveVehicle',
    'archiveVehicle',
    'restoreVehicle',
    'setPreferences',
    'saveFuelRecord',
    'recordFuelFill',
    'deleteFuelRecord'
  ];

  mutationMethods.forEach(name => {
    const original = module[name];
    if (typeof original !== 'function' || original.__oavixStorageSafe) return;

    const wrapped = function fuelStorageSafeMutation(...args) {
      const before = checkpoint();
      try {
        return original.apply(module, args);
      } catch (error) {
        try {
          restore(before);
        } catch (restoreError) {
          console.error('[OAVIX Fuel rollback]', restoreError);
        }
        console.error('[OAVIX Fuel storage]', error);
        notifyFailure();
        return false;
      }
    };
    wrapped.__oavixStorageSafe = true;
    module[name] = wrapped;
  });

  module.__oavixStorageGuardInstalled = true;
})(window);
