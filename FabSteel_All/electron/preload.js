const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('FabNative', { printPdf: name => ipcRenderer.invoke('fab:printPdf', name) });
