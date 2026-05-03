// Triskell Lanceur - preload bridge
// Seul pont autorise entre le renderer (UI) et le main process (Node).
// Tout passe par window.triskell.*

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('triskell', {
  // Catalogue local (apps.json)
  getApps:    () => ipcRenderer.invoke('triskell:get-apps'),
  getMeta:    () => ipcRenderer.invoke('triskell:get-meta'),

  // Auth (compte Triskell)
  auth: {
    getSession:  ()                 => ipcRenderer.invoke('auth:get-session'),
    login:       (email)            => ipcRenderer.invoke('auth:login', email),
    verify:      (email, code)      => ipcRenderer.invoke('auth:verify', { email, code }),
    logout:      ()                 => ipcRenderer.invoke('auth:logout')
  },

  // Licences (ce que l'utilisateur possede)
  licenses: {
    fetch: () => ipcRenderer.invoke('licenses:fetch')
  },

  // Etat installe local (installs.json)
  installs: {
    list: () => ipcRenderer.invoke('installs:list')
  },

  // Telechargement + install d'un produit
  install: {
    start:      (productId) => ipcRenderer.invoke('install:start', productId),
    onProgress: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on('install:progress', handler);
      return () => ipcRenderer.removeListener('install:progress', handler);
    }
  },

  // Lancement d'un produit installe
  launch: {
    product: (productId)        => ipcRenderer.invoke('launch:product', productId),
    tool:    (productId, toolId) => ipcRenderer.invoke('launch:tool', { productId, toolId })
  },

  // Liens externes (acheter, CGU, etc.)
  openExternal: (url) => ipcRenderer.invoke('triskell:open-external', url)
});
