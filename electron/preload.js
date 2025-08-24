// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Merge with any existing API you expose
contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
});
