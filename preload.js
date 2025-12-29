const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setTheme: (theme) => ipcRenderer.send('set-theme', theme)
});
