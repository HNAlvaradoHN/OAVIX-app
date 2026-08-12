/* OAVIX Drive Sync v2 - Sincronización bidireccional avanzada con Google Drive */
(function(){
  'use strict';
  
  if(window.__OAVIX_DRIVE_SYNC_V2__) return;
  window.__OAVIX_DRIVE_SYNC_V2__ = true;

  const FOLDER_NAME = 'OAVIX-Datos';
  const FILE_NAMES = {
    mainData: 'oavix-data.json',
    fuelData: 'oavix-fuel-data.json',
    fuelHistory: 'oavix-fuel-history.json',
    fuelConfig: 'oavix-fuel-config.json'
  };
  
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const POLL_INTERVAL = 12000; // Chequear cambios cada 12 segundos
  const FUEL_KEYS = ['oavix_fuel_data', 'oavix_fuel_history', 'oavix_fuel_vehicle_config'];
  
  let folderIdCache = null;
  let fileIdsCache = {};
  let lastModifiedCache = {};
  let pollTimer = null;
  let isSyncing = false;
  let sessionEmail = null;

  // 🔐 Obtener email de sesión actual
  function getSessionEmail() {
    try {
      const session = JSON.parse(localStorage.getItem('oavix_google_session') || 'null');
      return session && session.email ? session.email : null;
    } catch(e) {
      return null;
    }
  }

  // 🔑 Obtener token de acceso
  async function getAccessToken() {
    if(!window.OAVIXDriveSync) return null;
    try {
      const token = await window.OAVIXDriveSync.syncNow();
      return accessToken;
    } catch(e) {
      console.error('[Drive Sync v2]', e);
      return null;
    }
  }

  // 📁 Obtener o crear carpeta OAVIX-Datos
  async function getOrCreateFolder() {
    if(folderIdCache) return folderIdCache;
    
    try {
      const token = window.__OAVIX_TOKEN || '';
      if(!token) return null;

      // Buscar carpeta existente
      const query = `name='${FOLDER_NAME}' and 'appDataFolder' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;
      const searchUrl = 'https://www.googleapis.com/drive/v3/files?' + 
        'q=' + encodeURIComponent(query) + 
        '&spaces=appDataFolder&fields=files(id,name,modifiedTime)';
      
      const response = await fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if(!response.ok) return null;

      const data = await response.json();
      if(data.files && data.files.length > 0) {
        folderIdCache = data.files[0].id;
        return folderIdCache;
      }

      // Crear carpeta si no existe
      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['appDataFolder']
        })
      });

      if(!createResponse.ok) return null;

      const newFolder = await createResponse.json();
      folderIdCache = newFolder.id;
      return folderIdCache;
    } catch(e) {
      console.error('[Drive Folder]', e);
      return null;
    }
  }

  // 📄 Obtener ID de archivo en Drive
  async function getFileId(fileName) {
    if(fileIdsCache[fileName]) return fileIdsCache[fileName];

    try {
      const folderId = await getOrCreateFolder();
      if(!folderId) return null;

      const token = window.__OAVIX_TOKEN || '';
      const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
      const searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
        'q=' + encodeURIComponent(query) +
        '&fields=files(id,name,modifiedTime)';

      const response = await fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if(!response.ok) return null;

      const data = await response.json();
      if(data.files && data.files.length > 0) {
        fileIdsCache[fileName] = data.files[0].id;
        lastModifiedCache[fileName] = data.files[0].modifiedTime;
        return data.files[0].id;
      }

      return null;
    } catch(e) {
      console.error('[Drive File ID]', e);
      return null;
    }
  }

  // ⬇️ Descargar archivo desde Drive
  async function downloadFile(fileName) {
    try {
      const fileId = await getFileId(fileName);
      if(!fileId) return null;

      const token = window.__OAVIX_TOKEN || '';
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if(!response.ok) return null;

      return await response.json();
    } catch(e) {
      console.error('[Drive Download]', e);
      return null;
    }
  }

  // ⬆️ Subir archivo a Drive
  async function uploadFile(fileName, data) {
    try {
      const folderId = await getOrCreateFolder();
      if(!folderId) return false;

      const fileId = await getFileId(fileName);
      const token = window.__OAVIX_TOKEN || '';
      const payload = JSON.stringify(data);

      if(fileId) {
        // Actualizar archivo existente
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: payload
        });
        return response.ok;
      } else {
        // Crear archivo nuevo
        const metadata = {
          name: fileName,
          parents: [folderId],
          mimeType: 'application/json'
        };

        const boundary = 'oavix_' + Math.random().toString(16).slice(2);
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipart
        });

        if(response.ok) {
          const newFile = await response.json();
          fileIdsCache[fileName] = newFile.id;
          lastModifiedCache[fileName] = newFile.modifiedTime;
          return true;
        }
        return false;
      }
    } catch(e) {
      console.error('[Drive Upload]', e);
      return false;
    }
  }

  // 🔄 Sincronizar datos de combustible
  async function syncFuelData() {
    try {
      // Obtener datos locales
      const localFuelData = localStorage.getItem('oavix_fuel_data');
      const localFuelHistory = localStorage.getItem('oavix_fuel_history');
      const localFuelConfig = localStorage.getItem('oavix_fuel_vehicle_config');

      // Descargar datos de Drive
      const driveFuelData = await downloadFile(FILE_NAMES.fuelData);
      const driveFuelHistory = await downloadFile(FILE_NAMES.fuelHistory);
      const driveFuelConfig = await downloadFile(FILE_NAMES.fuelConfig);

      // Determinar qué versión es más reciente
      const localTimestamp = localStorage.getItem('oavix_fuel_sync_timestamp') || 0;
      const driveTimestamp = localStorage.getItem('oavix_drive_fuel_sync_timestamp') || 0;

      // Si Drive tiene datos más recientes, descargarlos
      if(driveTimestamp > localTimestamp && driveFuelData) {
        if(driveFuelData.data) localStorage.setItem('oavix_fuel_data', JSON.stringify(driveFuelData.data));
        if(driveFuelHistory && driveFuelHistory.data) localStorage.setItem('oavix_fuel_history', JSON.stringify(driveFuelHistory.data));
        if(driveFuelConfig && driveFuelConfig.data) localStorage.setItem('oavix_fuel_vehicle_config', JSON.stringify(driveFuelConfig.data));
        
        localStorage.setItem('oavix_drive_fuel_sync_timestamp', Date.now().toString());
        
        // Disparar evento para actualizar UI
        if(window.renderFuelPrices) window.renderFuelPrices();
        if(window.renderFuelModule) window.renderFuelModule();
        
        return true;
      }

      // Si hay datos locales sin sincronizar, subirlos
      if(localTimestamp > driveTimestamp) {
        const payload = { data: JSON.parse(localFuelData || '{}'), timestamp: new Date().toISOString() };
        
        await uploadFile(FILE_NAMES.fuelData, payload);
        if(localFuelHistory) await uploadFile(FILE_NAMES.fuelHistory, { data: JSON.parse(localFuelHistory), timestamp: new Date().toISOString() });
        if(localFuelConfig) await uploadFile(FILE_NAMES.fuelConfig, { data: JSON.parse(localFuelConfig), timestamp: new Date().toISOString() });
        
        localStorage.setItem('oavix_fuel_sync_timestamp', Date.now().toString());
        return true;
      }

      return false;
    } catch(e) {
      console.error('[Fuel Sync]', e);
      return false;
    }
  }

  // 🔄 Poller para detectar cambios en Drive
  async function pollDriveChanges() {
    if(isSyncing) return;

    try {
      isSyncing = true;
      
      // Sincronizar datos de combustible
      const changed = await syncFuelData();
      
      if(changed) {
        console.log('[Drive Sync v2] ✓ Datos sincronizados desde Drive');
        if(typeof window.showToast === 'function') {
          window.showToast('✓ Sincronizado', 'Datos actualizados desde otro dispositivo', 'emerald');
        }
      }
    } catch(e) {
      console.error('[Poll Error]', e);
    } finally {
      isSyncing = false;
    }
  }

  // ⏱️ Iniciar polling automático
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollDriveChanges, POLL_INTERVAL);
    console.log('[Drive Sync v2] Polling iniciado cada', POLL_INTERVAL, 'ms');
  }

  // ⏹️ Detener polling
  function stopPolling() {
    if(pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // 📤 Exportar API pública
  window.OAVIXDriveSyncV2 = {
    startPolling,
    stopPolling,
    syncNow: async function() {
      return await syncFuelData();
    },
    uploadFuelData: async function(fuelData, fuelHistory, fuelConfig) {
      await uploadFile(FILE_NAMES.fuelData, { data: fuelData, timestamp: new Date().toISOString() });
      await uploadFile(FILE_NAMES.fuelHistory, { data: fuelHistory, timestamp: new Date().toISOString() });
      await uploadFile(FILE_NAMES.fuelConfig, { data: fuelConfig, timestamp: new Date().toISOString() });
      return true;
    },
    downloadFuelData: async function() {
      return {
        fuelData: await downloadFile(FILE_NAMES.fuelData),
        fuelHistory: await downloadFile(FILE_NAMES.fuelHistory),
        fuelConfig: await downloadFile(FILE_NAMES.fuelConfig)
      };
    }
  };

  // 🚀 Iniciar al cargar página
  document.addEventListener('DOMContentLoaded', function() {
    sessionEmail = getSessionEmail();
    if(sessionEmail) {
      startPolling();
      // Sincronizar inmediatamente al iniciar
      pollDriveChanges();
    }
  });

  // 🛑 Detener polling al salir
  window.addEventListener('beforeunload', stopPolling);
})();
