// Triskell Lanceur - main process
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Notification, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const installer = require('./src/installer');
const store = require('./src/store');
const scanner = require('./src/scanner');

// On fixe le nom systeme avant tout pour que app.getPath('userData') reste
// stable peu importe le branding affiche (le titre/UI peut changer, mais le
// dossier userData ne doit jamais bouger sinon la session est perdue).
app.setName('Triskell Lanceur');

// =============================================================================
// Sentry : monitoring des erreurs en prod (main process + renderer).
// Si SENTRY_DSN est absent ou en dev, on no-op proprement.
// =============================================================================
try {
  const Sentry = require('@sentry/electron/main');
  const dsn = process.env.SENTRY_DSN || ''; // a configurer cote build/CI
  if (dsn && dsn.startsWith('https://')) {
    Sentry.init({
      dsn,
      release: `triskell-table-ronde@${require('./package.json').version}`,
      environment: process.env.TRISKELL_DEV === '1' ? 'development' : 'production',
      // On evite d'envoyer des breadcrumbs trop verbeux et on coupe la
      // capture automatique du contenu IPC (peut contenir le JWT user).
      sendDefaultPii: false,
      tracesSampleRate: 0.0
    });
    console.log('Sentry main initialise');
  }
} catch (_) { /* @sentry/electron pas installe — on ignore */ }

// electron-updater est seulement requis dans une appli packagee. En dev, on
// l'ignore pour ne pas planter quand le module manque ou que app n'est pas
// signee.
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; }
catch (_) { /* dev */ }

// =============================================================================
// Configuration
// =============================================================================
// API publique sur le domaine custom Triskell. L'URL netlify.app reste
// fonctionnelle aussi (cf. Netlify) et peut etre forcee via TRISKELL_API_URL
// pour les builds de dev.
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
    backgroundColor: '#0f1218',
    title: 'Triskell Lanceur',
    icon: path.join(__dirname, 'assets', 'triskell_mark_taskbar.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  // Ouvre la fenêtre maximisée (plein écran logique : remplit tout le bureau,
  // titre bar conservée). Le width/height définis ci-dessus servent de
  // dimension fallback quand l'utilisateur "restaure" la fenêtre.
  mainWindow.maximize();
  mainWindow.loadFile('index.html');

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  // Bascule le fetch global du main process sur le moteur reseau Chromium
  // d'Electron. Le fetch natif Node (undici) n'utilise pas le magasin de
  // certificats Windows, donc il rejette les antivirus a inspection HTTPS
  // (Avast, Bitdefender, ESET, Kaspersky...) qui injectent leur propre cert
  // racine. net.fetch passe par Chromium qui, lui, fait confiance au store
  // Windows et accepte donc le MITM benin de l'antivirus.
  globalThis.fetch = (input, init) => net.fetch(input, init);

  store.init(app.getPath('userData'));
  createWindow();
  setupAutoUpdate();
  // Easter-egg perso : si l'utilisateur cible est deja loggue ET que la
  // version a change depuis le dernier boot (= maj auto vient de finir),
  // on declenche la fenetre surprise. Verifie + retombe a plat si pas la
  // bonne cible / deja affichee.
  maybeShowSurprise('auto-update');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto-update (silencieux en arriere-plan, prompt avant install).
// Le check tourne au demarrage puis toutes les 4h. Un check manuel est aussi
// expose au renderer via ipc 'updates:check'.
let updaterReady = false;
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:status', { phase: 'available', version: info.version });
    }
  });

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:status', { phase: 'downloading', percent: p.percent });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:status', { phase: 'up-to-date' });
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:status', { phase: 'ready', version: info.version });
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Installer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour disponible',
      message: `Triskell Lanceur ${info.version} est prêt à être installé.`,
      detail: 'L\'application redémarrera pour appliquer la mise à jour. Sinon elle s\'installera automatiquement à la prochaine fermeture.'
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => {
    console.error('updater:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const raw = err && err.message ? err.message : '';
      let friendly = 'Vérification impossible. Réessaie plus tard.';
      if (/404/.test(raw)) friendly = 'Aucune mise à jour publiée pour le moment.';
      else if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|getaddrinfo|ENETUNREACH/i.test(raw)) friendly = 'Pas de connexion. Vérifie ton réseau.';
      mainWindow.webContents.send('updates:status', { phase: 'error', message: friendly });
    }
  });

  updaterReady = true;
  autoUpdater.checkForUpdates().catch(err =>
    console.error('check-for-updates:', err.message));

  // Re-check toutes les 4 heures tant que le Lanceur tourne.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

ipcMain.handle('updates:check', async () => {
  if (!updaterReady) return { ok: false, error: 'dev-mode' };
  try {
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, version: r && r.updateInfo ? r.updateInfo.version : null };
  } catch (err) {
    return { ok: false, error: 'check-failed', message: err.message };
  }
});

ipcMain.handle('updates:install', async () => {
  if (!updaterReady) return { ok: false, error: 'dev-mode' };
  autoUpdater.quitAndInstall();
  return { ok: true };
});

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
    // Voie founder/dev : le backend a ouvert la session directement.
    // On stocke le token et on signale au renderer de sauter l'ecran du code.
    if (data.skipCode && data.token && data.user) {
      store.setSession({ token: data.token, user: data.user });
      maybeShowSurprise('login');
      return { ok: true, autoLogin: true, user: data.user };
    }
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
    // Easter-egg perso : declenche apres login si l'email matche.
    maybeShowSurprise('login');
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  store.clearSession();
  return { ok: true };
});

ipcMain.handle('interest:notify-me', async (_evt, productKey) => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };
  try {
    const res = await fetch(`${API_BASE}/api/interest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ productKey })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'server-error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('auth:delete-account', async (_evt, confirmEmail) => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };
  try {
    const res = await fetch(`${API_BASE}/api/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ confirmEmail })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'server-error' };
    // Toute trace locale du compte degage : session, cache licenses, installs.
    store.clearSession();
    store.setCachedLicenses([]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

// =============================================================================
// Licences (depuis l'API, avec cache hors-ligne)
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
    const licenses = data.licenses || [];
    store.setCachedLicenses(licenses);
    return { ok: true, licenses, user: data.user, fromCache: false };
  } catch (err) {
    // Pas de reseau : on retourne le cache pour que le user puisse au moins
    // lancer ses outils deja installes.
    const cached = store.getCachedLicenses();
    if (cached.licenses && cached.licenses.length > 0) {
      return { ok: true, licenses: cached.licenses, user: session.user, fromCache: true, cachedAt: cached.cachedAt };
    }
    return { ok: false, error: 'network', message: err.message };
  }
});

// =============================================================================
// Versions a jour des produits (pour detecter "Mise a jour disponible").
// Le backend doit exposer GET /api/versions qui renvoie
// { "suite-des-heros": "1.2.3", "delinote": "0.4.0", ... }
// Si l'endpoint n'existe pas (404, network), on retourne {} silencieusement.
// =============================================================================
ipcMain.handle('versions:fetch', async () => {
  try {
    const res = await fetch(`${API_BASE}/api/versions`);
    if (!res.ok) return {};
    return await res.json();
  } catch (_) {
    return {};
  }
});

// =============================================================================
// Installations locales
// =============================================================================
ipcMain.handle('installs:list', async () => store.getInstalls());

// Scan auto : trouve les produits installes "ailleurs" (avant le Lanceur,
// par ex. via productivite.triskell-studio.fr) et les ajoute a installs.json.
// Renvoie la liste des produits nouvellement detectes (pour toast UX).
ipcMain.handle('installs:scan', async (_evt, productIds) => {
  try {
    const known = store.getInstalls();
    const found = scanner.scanAll(productIds || [], known);
    for (const f of found) {
      store.setInstall(f.productId, {
        installPath: f.installPath,
        mainExe: f.mainExe,
        version: f.version,
        autoDetected: true,
        source: f.source,
      });
    }
    return { ok: true, detected: found };
  } catch (err) {
    console.error('scan:', err.message);
    return { ok: false, error: err.message, detected: [] };
  }
});

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
    showSystemNotification(`${product.name} installé`,
      `Tu peux le lancer depuis le Lanceur Triskell.`);
    return { ok: true, ...result };
  } catch (err) {
    onProgress({ phase: 'error', message: err.message });
    return { ok: false, error: 'install-failed', message: err.message };
  }
});

// Desinstalle un produit : supprime le dossier d'install + l'entree du store.
ipcMain.handle('install:uninstall', async (_evt, productId) => {
  const inst = store.getInstalls()[productId];
  if (!inst) return { ok: false, error: 'not-installed' };

  try {
    if (inst.installPath && fs.existsSync(inst.installPath)) {
      fs.rmSync(inst.installPath, { recursive: true, force: true });
    }
    store.removeInstall(productId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'uninstall-failed', message: err.message };
  }
});

function showSystemNotification(title, body) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets', 'triskell_mark_taskbar.png'),
      silent: false
    }).show();
  } catch (_) { /* best-effort */ }
}

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
    // Le dossier a pu etre supprime (desinstall manuelle) : on nettoie le
    // store pour que la tuile repasse en "Installer" au prochain refresh.
    if (!inst.installPath || !fs.existsSync(inst.installPath)) {
      store.removeInstall(productId);
      return { ok: false, error: 'not-installed' };
    }
    shell.openPath(inst.installPath);
    return { ok: true };
  }

  // Sinon : un seul exe a lancer.
  const inst = store.getInstalls()[productId];
  if (!inst || !inst.mainExe) return { ok: false, error: 'not-installed' };
  // L'.exe a pu disparaitre (desinstall manuelle, install fantome heritee
  // d'un installer annule, antivirus...). Avant de tenter spawn, on verifie
  // sa presence ; si absent on purge l'entree du store pour que la tuile
  // repasse en "Installer" automatiquement.
  if (!fs.existsSync(inst.mainExe)) {
    store.removeInstall(productId);
    return { ok: false, error: 'not-installed' };
  }
  const result = spawnExe(inst.mainExe);
  if (result && result.ok) store.recordLaunch(productId);
  return result;
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
  if (!fs.existsSync(exePath)) {
    // Si le dossier d'install n'existe meme plus, on purge tout l'install
    // du produit ; sinon on signale juste l'outil manquant (les autres
    // outils du bundle peuvent etre OK).
    if (!inst.installPath || !fs.existsSync(inst.installPath)) {
      store.removeInstall(productId);
      return { ok: false, error: 'not-installed' };
    }
    return { ok: false, error: 'tool-missing' };
  }
  const result = spawnExe(exePath);
  if (result && result.ok) store.recordLaunch(productId, toolId);
  return result;
});

ipcMain.handle('stats:get', async () => store.getStats());

// Stripe Customer Portal : cree une session et renvoie l'URL au renderer.
// Le renderer ouvre l'URL dans le navigateur par defaut. Si pas de stripe
// customer associe (user qui n'a jamais paye), renvoie no-stripe-customer
// pour que le frontend bascule sur le mailto.
ipcMain.handle('billing:open-portal', async () => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };
  try {
    const res = await fetch(`${API_BASE}/api/customer-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `http-${res.status}` };
    if (data.url) shell.openExternal(data.url);
    return { ok: true, url: data.url };
  } catch (err) {
    console.error('billing:open-portal:', err.message);
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('triskell:open-external', async (_evt, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, error: 'invalid-url' };
});

// =============================================================================
// Preferences (auto-launch Windows, etc.)
// =============================================================================
ipcMain.handle('prefs:get', async () => {
  const prefs = store.getPrefs();
  // Source de verite pour openAtLogin = Electron lui-meme (pas le store).
  const loginItem = app.getLoginItemSettings();
  return {
    ...prefs,
    openAtLogin: loginItem.openAtLogin,
    openAsHidden: loginItem.openAsHidden || false
  };
});

ipcMain.handle('prefs:set-auto-launch', async (_evt, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
      args: ['--auto-launched']
    });
    store.setPref('autoLaunch', !!enabled);
    return { ok: true, openAtLogin: app.getLoginItemSettings().openAtLogin };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('prefs:set-telemetry', async (_evt, enabled) => {
  store.setPref('telemetry', !!enabled);
  return { ok: true };
});

ipcMain.handle('prefs:set-last-used', async (_evt, productId) => {
  const prefs = store.getPrefs();
  const lastUsed = Array.isArray(prefs.lastUsed) ? prefs.lastUsed : [];
  const next = [productId, ...lastUsed.filter(id => id !== productId)].slice(0, 5);
  store.setPref('lastUsed', next);
  return { ok: true, lastUsed: next };
});

ipcMain.handle('prefs:set-display-name', async (_evt, name) => {
  const clean = String(name || '').trim().slice(0, 40);
  store.setPref('displayName', clean);
  return { ok: true, displayName: clean };
});

ipcMain.handle('prefs:set-last-seen-version', async (_evt, version) => {
  store.setPref('lastSeenVersion', String(version || ''));
  return { ok: true };
});

// Avatar : data URL base64 (PNG/JPEG), tronque a 200 KB pour ne pas faire
// gonfler prefs.json. Une chaine vide = pas d'avatar (on retombe sur les
// initiales).
ipcMain.handle('prefs:set-avatar', async (_evt, dataUrl) => {
  const v = String(dataUrl || '');
  if (!v) {
    store.setPref('avatar', '');
    return { ok: true, avatar: '' };
  }
  if (!v.startsWith('data:image/')) {
    return { ok: false, error: 'invalid-data-url' };
  }
  if (v.length > 250000) {
    return { ok: false, error: 'too-large', message: 'Image > 200 Ko, redimensionne avant upload.' };
  }
  store.setPref('avatar', v);
  return { ok: true, avatar: v };
});

// =============================================================================
// Changelog : recupere les release notes depuis l'API GitHub. Le main process
// fait le fetch (la CSP du renderer bloque api.github.com).
// =============================================================================
ipcMain.handle('changelog:fetch', async (_evt, version) => {
  if (!version || typeof version !== 'string') {
    return { ok: false, error: 'invalid-version' };
  }
  const tag = version.startsWith('v') ? version : `v${version}`;
  try {
    const res = await fetch(
      `https://api.github.com/repos/Jordan-Bourillot/triskell-table-ronde/releases/tags/${encodeURIComponent(tag)}`,
      { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'TriskellTableRonde' } }
    );
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const data = await res.json();
    return {
      ok: true,
      tag,
      name: data.name || tag,
      body: data.body || '',
      published_at: data.published_at,
      url: data.html_url
    };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
});

ipcMain.handle('prefs:set-onboarding-dismissed', async (_evt, yes) => {
  store.setPref('onboardingDismissed', !!yes);
  return { ok: true };
});

// Liste d'IDs d'annonces que l'utilisateur a dismiss (bouton X). Une annonce
// déjà dans cette liste ne sera plus affichée. Quand Jordan publie une
// nouvelle annonce, il change l'id dans apps.json -> non présent dans la
// liste -> l'annonce s'affiche à nouveau.
ipcMain.handle('prefs:dismiss-announcement', async (_evt, id) => {
  if (!id || typeof id !== 'string') return { ok: false, error: 'invalid-id' };
  const all = store.getPrefs() || {};
  const list = Array.isArray(all.dismissedAnnouncements) ? all.dismissedAnnouncements : [];
  if (!list.includes(id)) list.push(id);
  // Garde-fou : on évite que la liste explose si Jordan publie 1000 annonces
  // sur la durée. 200 IDs c'est largement assez (et 200 strings = quelques KB).
  while (list.length > 200) list.shift();
  store.setPref('dismissedAnnouncements', list);
  return { ok: true };
});

// Theme : 'dark' | 'light' | 'auto' (suit l'OS). Persiste localement et le
// renderer applique data-theme=... sur <html> au boot.
ipcMain.handle('prefs:set-theme', async (_evt, theme) => {
  const t = ['dark', 'light', 'auto'].includes(theme) ? theme : 'dark';
  store.setPref('theme', t);
  return { ok: true, theme: t };
});

// Persistance du dernier onglet (catégorie) ouvert. Au prochain lancement,
// l'app rouvre directement sur ce chapitre — l'utilisateur retrouve son
// contexte au lieu de toujours retomber sur Quotidien.
ipcMain.handle('prefs:set-last-category', async (_evt, categoryId) => {
  const id = typeof categoryId === 'string' ? categoryId.slice(0, 40) : '';
  if (!id) return { ok: false };
  store.setPref('lastCategory', id);
  return { ok: true, lastCategory: id };
});

// Mode d'affichage de la grille des produits :
//   'hero'     -> Vue Vedette (hero asymétrique 2x2 + cards normales)
//   'compact'  -> Vue Compacte (grille uniforme, cards plus petites)
//   'discover' -> Vue Découverte (carrousel, 1 produit à la fois)
// La pref est persistee et restauree au prochain boot.
ipcMain.handle('prefs:set-view-mode', async (_evt, mode) => {
  const m = ['hero', 'compact', 'discover'].includes(mode) ? mode : 'hero';
  store.setPref('viewMode', m);
  return { ok: true, viewMode: m };
});

// =============================================================================
// Achat in-app : ouvre Stripe Checkout dans une fenetre Electron, ecoute les
// navigations vers la page success, ferme la fenetre et notifie le renderer.
// =============================================================================
ipcMain.handle('purchase:open', async (_evt, { url, productId }) => {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, error: 'invalid-url' };

  const win = new BrowserWindow({
    width: 980,
    height: 760,
    parent: mainWindow,
    modal: false,
    title: 'Achat sécurisé · Triskell',
    backgroundColor: '#0f1218',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.maximize();

  const success = (sessionId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('purchase:completed', { productId, sessionId });
    }
    if (!win.isDestroyed()) win.close();
  };

  const inspectUrl = (urlStr) => {
    if (typeof urlStr !== 'string') return;
    if (/\/success\b/i.test(urlStr) || /session_id=/i.test(urlStr)) {
      const m = urlStr.match(/session_id=([^&]+)/);
      success(m ? decodeURIComponent(m[1]) : null);
    }
  };

  win.webContents.on('did-navigate', (_e, u) => inspectUrl(u));
  win.webContents.on('did-navigate-in-page', (_e, u) => inspectUrl(u));
  win.loadURL(url);
  return { ok: true };
});

// Achat du bundle dynamique "Completer ta Table". Le frontend envoie le tier
// (2/3/4 apps manquantes) et la liste des productIds correspondante. Le
// backend choisit le bon prix Stripe et cree une session checkout dont
// l'URL est renvoyee ici. On reutilise le meme flux purchase:open qu'un
// achat single.
ipcMain.handle('purchase:completion', async (_evt, { count, productIds, expectedPrice }) => {
  const session = store.getSession();
  if (!session) return { ok: false, error: 'not-authenticated' };

  try {
    const res = await fetch(`${API_BASE}/api/create-completion-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ count, productIds, expectedPrice })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) return { ok: false, error: data.error || 'no-url' };

    // On reutilise la meme fenetre Electron que pour les achats single.
    const win = new BrowserWindow({
      width: 980, height: 760, parent: mainWindow, modal: false,
      title: 'Compléter ta Table · Triskell',
      backgroundColor: '#0f1218', autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    win.maximize();
    const success = (sessionId) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('purchase:completed', {
          productId: 'completion-bundle', count, productIds, sessionId
        });
      }
      if (!win.isDestroyed()) win.close();
    };
    const inspectUrl = (u) => {
      if (typeof u !== 'string') return;
      if (/\/success\b/i.test(u) || /session_id=/i.test(u)) {
        const m = u.match(/session_id=([^&]+)/);
        success(m ? decodeURIComponent(m[1]) : null);
      } else if (/\/cancel\b/i.test(u)) {
        // User a annule sur Stripe : on ferme la fenetre proprement (sans
        // declencher purchase:completed) plutot que de lui laisser une 404
        // si app.triskell-studio.fr/cancel n'a pas de page deployee.
        if (!win.isDestroyed()) win.close();
      }
    };
    win.webContents.on('did-navigate', (_e, u) => inspectUrl(u));
    win.webContents.on('did-navigate-in-page', (_e, u) => inspectUrl(u));
    win.loadURL(data.url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
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

// =============================================================================
// Easter-egg perso : Triskell Command pour Thomas (frere de Jordan).
// Declenche UNE SEULE FOIS (flag prefs.surpriseShown = true apres) lors :
//   - du prochain login d'un email cible
//   - OU du prochain demarrage apres une mise a jour auto (version change)
// Affiche une fenetre Electron dediee avec un bouton qui ouvre le .exe
// dans le navigateur. Aucun effet pour les autres utilisateurs.
// =============================================================================
const SURPRISE_TARGETS = new Set([
  'thomas.bourillot@gmail.com',
  'thomasbourillot@gmail.com'
]);
const SURPRISE_DOWNLOAD_URL =
  'https://github.com/Jordan-Bourillot/triskell-command/releases/latest/download/triskell-command-setup.exe';
const SURPRISE_MESSAGE =
  'Jordan est en route, l’hélico arrive, t’entends pas ou quoi ?';

function maybeShowSurprise(reason) {
  try {
    const session = store.getSession();
    if (!session || !session.user || !session.user.email) return;
    const email = String(session.user.email).trim().toLowerCase();
    if (!SURPRISE_TARGETS.has(email)) return;

    const prefs = store.getPrefs() || {};
    if (prefs.surpriseShown) return;

    // Pour le trigger "auto-update", on ne fire que si la version a
    // effectivement change depuis le dernier boot (lastSeenVersion stocke
    // par le flux changelog). Si lastSeenVersion est vide (premier install
    // jamais), on ne fire PAS via auto-update — uniquement via login.
    if (reason === 'auto-update') {
      const seen = prefs.lastSeenVersion || '';
      if (!seen || seen === app.getVersion()) return;
    }

    // On marque shown immediatement pour eviter qu'un double trigger (login
    // + auto-update qui se chevaucheraient) ouvre 2 fenetres.
    store.setPref('surpriseShown', true);

    // Petit delai pour que le main UI ait le temps de rendre avant que la
    // fenetre surprise pop par-dessus.
    setTimeout(() => showSurpriseWindow(), 1500);
  } catch (err) {
    console.error('surprise check failed:', err && err.message);
  }
}

function showSurpriseWindow() {
  try {
    const win = new BrowserWindow({
      width: 580,
      height: 420,
      parent: mainWindow,
      modal: false,
      title: 'Triskell Command',
      backgroundColor: '#0f1218',
      autoHideMenuBar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    win.setMenuBarVisibility(false);

    // Le bouton est un <a target="_blank"> + handler qui ouvre l'URL dans
    // le navigateur par defaut au lieu d'une nouvelle fenetre Electron.
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    const safeMessage = SURPRISE_MESSAGE
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Triskell Command</title>
<style>
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; height:100%; }
  body { background: linear-gradient(160deg, #0f1218 0%, #161a20 100%);
    color:#e9e6df; font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    line-height:1.5; padding:36px 40px; display:flex; flex-direction:column;
    justify-content:center; }
  h1 { font-family:'Cinzel',Georgia,serif; color:#c9a961; font-size:30px;
    margin:0 0 28px; letter-spacing:1px; text-align:center; font-weight:700; }
  .quote { font-style:italic; font-size:19px; color:#e9e6df; text-align:center;
    margin:0 0 36px; padding:0 12px; line-height:1.55; }
  .btn { display:block; width:100%; padding:18px 24px; font-size:16px;
    font-weight:700; letter-spacing:0.5px; background:#c9a961; color:#1a1408;
    border:none; border-radius:10px; text-align:center; text-decoration:none;
    cursor:pointer; box-shadow:0 8px 24px rgba(201,169,97,0.20); }
  .btn:hover { background:#d4b35a; transform:translateY(-1px);
    box-shadow:0 10px 28px rgba(201,169,97,0.30); }
  .btn:active { transform:translateY(0); }
  .footer { margin-top:18px; font-size:11px; color:#6b7280; text-align:center;
    letter-spacing:0.3px; }
</style></head>
<body>
  <h1>Triskell Command</h1>
  <p class="quote">“${safeMessage}”</p>
  <a class="btn" href="${SURPRISE_DOWNLOAD_URL}" target="_blank" rel="noopener">
    Télécharger Triskell Command
  </a>
  <div class="footer">Le téléchargement démarrera dans ton navigateur.</div>
</body></html>`;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.once('ready-to-show', () => win.show());
  } catch (err) {
    console.error('showSurpriseWindow failed:', err && err.message);
  }
}
