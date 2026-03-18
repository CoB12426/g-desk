const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Renderer -> Main
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  addAccount: (accountName) => ipcRenderer.send('add-account', accountName),
  switchAccount: (viewId) => ipcRenderer.send('switch-account', viewId),
  switchService: (serviceKey) => ipcRenderer.send('switch-service', serviceKey),
  hideView: () => ipcRenderer.send('hide-view'),
  showView: () => ipcRenderer.send('show-view'),
  setUiTopInset: (topInsetPx) => ipcRenderer.send('ui-top-inset', topInsetPx),

  // Main -> Renderer
  onAccountAdded: (callback) => ipcRenderer.on('account-added', (_event, value) => callback(value)),
  onAccountAddedComplete: (callback) => ipcRenderer.on('account-added-complete', (_event, value) => callback(value)),
  onSetActiveTab: (callback) => ipcRenderer.on('set-active-tab', (_event, value) => callback(value)),
  onActiveService: (callback) => ipcRenderer.on('active-service', (_event, value) => callback(value)),
});