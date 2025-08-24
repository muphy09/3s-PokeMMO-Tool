// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),

  // optional manual trigger for OCR if you add a button in the UI
  startOCR: () => ipcRenderer.invoke('start-ocr'),
});
