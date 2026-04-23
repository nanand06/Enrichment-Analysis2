// Preload script - exposes secure APIs to the renderer process
// This runs in a context that has access to both Node.js APIs and the DOM
// but uses contextBridge to safely expose only what we need

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the file dialog without exposing the entire Node.js API
contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  getBackendPort: () => ipcRenderer.invoke('backend:getPort'),
});
