// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  // updater
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),

  // OCR controls
  startOCR: () => ipcRenderer.invoke('start-ocr'),
  reloadOCR: () => ipcRenderer.invoke('reload-ocr'),

  // window
  refreshApp: () => ipcRenderer.invoke('refresh-app'),
});
