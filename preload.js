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
    getSession:    ()             => ipcRenderer.invoke('auth:get-session'),
    login:         (email)        => ipcRenderer.invoke('auth:login', email),
    verify:        (email, code)  => ipcRenderer.invoke('auth:verify', { email, code }),
    logout:        ()             => ipcRenderer.invoke('auth:logout'),
    deleteAccount: (confirmEmail) => ipcRenderer.invoke('auth:delete-account', confirmEmail)
  },

  // Licences (ce que l'utilisateur possede)
  licenses: {
    fetch: () => ipcRenderer.invoke('licenses:fetch')
  },

  // Etat installe local (installs.json)
  installs: {
    list: () => ipcRenderer.invoke('installs:list'),
    scan: (productIds) => ipcRenderer.invoke('installs:scan', productIds)
  },

  // Stats d'usage (compteurs de lancements, premier/dernier)
  stats: {
    get: () => ipcRenderer.invoke('stats:get')
  },

  // Stripe billing portal (factures, methodes de paiement)
  billing: {
    openPortal: () => ipcRenderer.invoke('billing:open-portal')
  },

  // Versions a jour de chaque produit (depuis le backend, pour detecter MAJ)
  versions: {
    fetch: () => ipcRenderer.invoke('versions:fetch')
  },

  // Telechargement + install d'un produit
  install: {
    start:      (productId) => ipcRenderer.invoke('install:start', productId),
    uninstall:  (productId) => ipcRenderer.invoke('install:uninstall', productId),
    onProgress: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on('install:progress', handler);
      return () => ipcRenderer.removeListener('install:progress', handler);
    }
  },

  // Achat in-app (Stripe Checkout dans une fenetre Electron, retour licence auto)
  purchase: {
    open: (url, productId) => ipcRenderer.invoke('purchase:open', { url, productId }),
    openCompletion: (tier, productIds) => ipcRenderer.invoke('purchase:completion', { tier, productIds }),
    onCompleted: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on('purchase:completed', handler);
      return () => ipcRenderer.removeListener('purchase:completed', handler);
    }
  },

  // Preferences (auto-launch, telemetrie...)
  prefs: {
    get:                     ()         => ipcRenderer.invoke('prefs:get'),
    setAutoLaunch:           (enabled)  => ipcRenderer.invoke('prefs:set-auto-launch', enabled),
    setTelemetry:            (enabled)  => ipcRenderer.invoke('prefs:set-telemetry', enabled),
    setLastUsed:             (productId)=> ipcRenderer.invoke('prefs:set-last-used', productId),
    setDisplayName:          (name)     => ipcRenderer.invoke('prefs:set-display-name', name),
    setOnboardingDismissed:  (yes)      => ipcRenderer.invoke('prefs:set-onboarding-dismissed', yes)
  },

  // Interet sur un produit pas encore en vente (Studio PDF, Bobeez, ...)
  interest: {
    notifyMe: (productKey) => ipcRenderer.invoke('interest:notify-me', productKey)
  },

  // Lancement d'un produit installe
  launch: {
    product: (productId)        => ipcRenderer.invoke('launch:product', productId),
    tool:    (productId, toolId) => ipcRenderer.invoke('launch:tool', { productId, toolId })
  },

  // Liens externes (acheter, CGU, etc.)
  openExternal: (url) => ipcRenderer.invoke('triskell:open-external', url),

  // Auto-update du Lanceur lui-meme (electron-updater + GitHub Releases).
  updates: {
    check:       ()    => ipcRenderer.invoke('updates:check'),
    installNow:  ()    => ipcRenderer.invoke('updates:install'),
    onStatus: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on('updates:status', handler);
      return () => ipcRenderer.removeListener('updates:status', handler);
    }
  }
});
