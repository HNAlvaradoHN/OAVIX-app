(function initializeDriveClient(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state } = runtime.context;

  async function drive(method, url, options = {}) {
    let token = await runtime.auth.ensureToken(Boolean(options.interactive));
    const request = { ...options };
    delete request.interactive;
    request.method = method;
    request.headers = {
      ...(request.headers || {}),
      Authorization: 'Bearer ' + token
    };

    let response = await root.fetch(url, request);
    if (response.status === 401) {
      state.accessToken = null;
      state.tokenExpiresAt = 0;
      token = await runtime.auth.ensureToken(true);
      request.headers.Authorization = 'Bearer ' + token;
      response = await root.fetch(url, request);
    }
    if (!response.ok) throw new Error('Google Drive respondió con ' + response.status);
    return response;
  }

  async function findFile() {
    const query = `name='${constants.fileName}' and 'appDataFolder' in parents and trashed=false`;
    const response = await drive(
      'GET',
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) +
        '&spaces=appDataFolder&fields=files(id,name,modifiedTime)',
      { interactive: false }
    );
    const data = await response.json();
    return data.files && data.files[0] || null;
  }

  async function readCloud() {
    const file = await findFile();
    if (!file) return null;
    state.fileId = file.id;
    const response = await drive(
      'GET',
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media',
      { interactive: false }
    );
    const payload = await response.json();
    payload.updatedAt = payload.updatedAt || file.modifiedTime;
    return payload;
  }

  async function writeCloud(payload) {
    const body = JSON.stringify(payload);
    let file = state.fileId ? { id: state.fileId } : await findFile();

    if (!file) {
      const boundary = 'oavix_' + Math.random().toString(16).slice(2);
      const metadata = {
        name: constants.fileName,
        parents: ['appDataFolder'],
        mimeType: 'application/json'
      };
      const multipart =
        '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
        body +
        '\r\n--' + boundary + '--';
      const response = await drive(
        'POST',
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
        {
          interactive: false,
          headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
          body: multipart
        }
      );
      file = await response.json();
    } else {
      state.fileId = file.id;
      await drive(
        'PATCH',
        'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media',
        {
          interactive: false,
          headers: { 'Content-Type': 'application/json' },
          body
        }
      );
    }

    state.fileId = file.id;
  }

  runtime.drive = { drive, findFile, readCloud, writeCloud };
})(window);
