const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (args) => ipcRenderer.invoke('readFile', args),
  writeFile: (args) => ipcRenderer.invoke('writeFile', args),
  listFiles: (args) => ipcRenderer.invoke('listFiles', args)
});
