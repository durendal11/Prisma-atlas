const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Backend communication
    getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
    isBackendRunning: () => ipcRenderer.invoke('is-backend-running'),
    restartBackend: () => ipcRenderer.send('restart-backend'),
    
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    
    // Storage
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
    
    // External links
    openExternal: (url) => ipcRenderer.send('open-external', url),
    
    // Notifications
    showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
    
    // Event listeners
    onNavigate: (callback) => {
        ipcRenderer.on('navigate', (event, path) => callback(path));
    },
    onDetectionsBatch: (callback) => {
        ipcRenderer.on('ws-detections-batch', (event, batch) => callback(batch));
    },
    
    // Platform info
    platform: process.platform,
    isElectron: true
});

// Also expose a flag that can be checked synchronously
window.isElectron = true;
