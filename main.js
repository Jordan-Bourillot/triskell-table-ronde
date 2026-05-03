// Triskell Lanceur - main process
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const installer = require('./src/installer');
const store = require('./src/store');

// electron-updater est seulement requis dans une appli packagee. En dev, on
// l'ignore pour ne pas planter quand le module manque ou que app n'est pas
// signee.
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; }
catch (_) { /* dev */ }

// =============================================================================
// Configuration
// =============================================================================
const API_BASE = process.env.TRISKELL_API_URL || 'https://api.triskell-studio.fr';
const IS_DEV = process.env.TRISKELL_DEV === '1';

let mainWindow;

// =============================================================================
// Fenetre
// =============================================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0d0f12',
    title: 'Triskell Lanceur',
    icon: path.join(__dirname, 'assets', 'logo_triskell.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto-update (silencieux en arriere-plan, prompt avant install).
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Installer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour disponible',
      message: `Triskell Lanceur ${info.version} est prêt à être installé.`,
      detail: 'L\'application redémarrera pour appliquer la mise à jour.'
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => console.error('updater:', err.message));

  autoUpdater.checkForUpdates().catch(err =>
    console.error('check-for-updates:', err.message));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// =============================================================================
// Catalogue local (apps.json) + meta
// =============================================================================
ipcMain.handle('triskell:get-apps', async () => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { error: err.message, apps: [], categories: [] };
  }
});

ipcMain.handle('triskell:get-meta', async () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  apiBase: API_BASE
}));

// =============================================================================
// Auth (compte Triskell, code 6 chiffres par email)
// =============================================================================
ipcMain.handle('auth:get-session', async () => {
  return store.getSession();   // { token, user } ou null
});

ipcMain.handle('auth:login', async (_evt, email) => {
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, error: 'invalid-email' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'server-error' };
    return { ok: true, expiresIn: data.expiresIn };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('auth:verify', async (_evt, { email, code }) => {
  try {
    const res = await fetch(`${API_BASE}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        code: String(code || '').replace(/\s/g, '')
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'server-error' };
    store.setSession({ token: data.token, user: data.user });
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  store.clearSession();
  return { ok: true };
});

// =============================================================================
// Licences (depuis l'API)
// =============================================================================
ipcMain.handle('licenses:fetch', async () => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    if (res.status === 401) {
      store.clearSession();
      return { ok: false, error: 'session-expired' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'server-error' };
    return { ok: true, licenses: data.licenses || [], user: data.user };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

// =============================================================================
// Installations locales
// =============================================================================
ipcMain.handle('installs:list', async () => store.getInstalls());

ipcMain.handle('install:start', async (_evt, productId) => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };

  const apps = readApps();
  const product = apps.find(a => a.id === productId);
  if (!product) return { ok: false, error: 'unknown-product' };

  const onProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install:progress', { productId, ...data });
    }
  };

  try {
    const result = await installer.installProduct({
      product,
      apiBase: API_BASE,
      sessionToken: session.token,
      onProgress
    });
    store.setInstall(productId, result);
    return { ok: true, ...result };
  } catch (err) {
    onProgress({ phase: 'error', message: err.message });
    return { ok: false, error: 'install-failed', message: err.message };
  }
});

// =============================================================================
// Lancement
// =============================================================================
ipcMain.handle('launch:product', async (_evt, productId) => {
  const apps = readApps();
  const product = apps.find(a => a.id === productId);
  if (!product) return { ok: false, error: 'unknown-product' };

  // Pour un produit a outils multiples (Suite des Heros) : on ouvre le dossier
  // d'install pour que l'utilisateur choisisse l'outil. La V2 ouvrira un
  // sous-menu en UI dans le Lanceur.
  if (product.tools && product.tools.length > 0) {
    const inst = store.getInstalls()[productId];
    if (!inst) return { ok: false, error: 'not-installed' };
    shell.openPath(inst.installPath);
    return { ok: true };
  }

  // Sinon : un seul exe a lancer.
  const inst = store.getInstalls()[productId];
  if (!inst || !inst.mainExe) return { ok: false, error: 'not-installed' };
  return spawnExe(inst.mainExe);
});

ipcMain.handle('launch:tool', async (_evt, { productId, toolId }) => {
  const apps = readApps();
  const product = apps.find(a => a.id === productId);
  if (!product || !product.tools) return { ok: false, error: 'unknown-product' };

  const tool = product.tools.find(t => t.id === toolId);
  if (!tool) return { ok: false, error: 'unknown-tool' };

  const inst = store.getInstalls()[productId];
  if (!inst) return { ok: false, error: 'not-installed' };

  const exePath = path.join(inst.installPath, tool.exe);
  return spawnExe(exePath);
});

ipcMain.handle('triskell:open-external', async (_evt, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, error: 'invalid-url' };
});

// =============================================================================
// Helpers
// =============================================================================
function readApps() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf8');
    return JSON.parse(raw).apps || [];
  } catch (_) {
    return [];
  }
}

function spawnExe(exePath) {
  if (!exePath || !fs.existsSync(exePath)) {
    return { ok: false, error: 'not-found', exePath };
  }
  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exePath)
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'spawn-failed', message: err.message };
  }
}
