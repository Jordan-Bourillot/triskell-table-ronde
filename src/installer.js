// Telechargement et installation d'un produit Triskell.
//
// Flux :
//   1. POST /api/install-token { productId } -> recoit { downloadUrl, version, kind }
//   2. Telecharge l'artefact dans %TEMP% (avec progres)
//   3. Pour 'zip-bundle' : extrait avec PowerShell Expand-Archive vers
//      <Documents>\<installPath>
//      Pour 'exe-installer' : execute le .exe (l'installeur fait son boulot)
//   4. Renvoie { installPath, mainExe }
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const https = require('https');

function homeDocuments() {
  return path.join(os.homedir(), 'Documents');
}

// Le backend renvoie expectedExePath avec le placeholder <USER> car il ne
// connait pas le nom Windows local. On substitue ici avec le username reel
// avant de stocker mainExe — sinon spawnExe('C:\\Users\\<USER>\\...') echoue
// avec not-found au prochain "Lancer".
function resolveLocalUserPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  return rawPath.replace(/<USER>/g, os.userInfo().username);
}

async function getInstallToken({ apiBase, sessionToken, productId }) {
  const res = await fetch(`${apiBase}/api/install-token?product=${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.error || `http-${res.status}`;
    throw new Error(`install-token: ${code}`);
  }
  return data;   // { downloadUrl, version, kind, mainExe? }
}

function downloadFile({ url, destPath, onProgress }) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let received = 0;
    let total = 0;

    const handleResponse = (res) => {
      // Suivre les redirections (302/301)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        https.get(next, handleResponse).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
        res.resume();
        return;
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress({ received, total });
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ received, total })));
      file.on('error', (err) => { fs.unlink(destPath, () => reject(err)); });
    };

    https.get(url, handleResponse).on('error', reject);
  });
}

// Extrait un ZIP avec PowerShell Expand-Archive (built-in Windows).
function extractZipWindows(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ], { windowsHide: true });

    let stderr = '';
    ps.stderr.on('data', (b) => { stderr += b.toString(); });
    ps.on('error', reject);
    ps.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Expand-Archive a échoué (code ${code}) ${stderr}`));
    });
  });
}

function runExeInstaller(exePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, [], { detached: false, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      // Beaucoup d'installeurs renvoient 0 meme apres "Annuler" — on accepte tout.
      resolve({ exitCode: code });
    });
  });
}

// NSIS/InnoSetup peuvent finir d'ecrire les fichiers apres la fermeture de
// l'UI. On poll quelques secondes pour laisser le filesystem se stabiliser
// avant de declarer l'install ratee.
async function waitForExe(exePath, { timeoutMs = 8000, intervalMs = 400 } = {}) {
  if (!exePath) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(exePath)) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return fs.existsSync(exePath);
}

// Aplati un dossier extrait : si le ZIP contient un seul sous-dossier
// (typiquement "SuiteDesHeros-v1.0/"), on remonte son contenu d'un cran.
function flattenIfSingleFolder(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const inner = path.join(dir, entries[0].name);
    const sub = fs.readdirSync(inner);
    for (const item of sub) {
      fs.renameSync(path.join(inner, item), path.join(dir, item));
    }
    fs.rmdirSync(inner);
  }
}

async function installProduct({ product, apiBase, sessionToken, onProgress }) {
  const productId = product.id;
  const productKey = product.installer && product.installer.productKey;
  if (!productKey) throw new Error('produit sans installer');

  onProgress({ phase: 'token', percent: 0, message: 'Préparation de la Table...' });
  const tokenInfo = await getInstallToken({ apiBase, sessionToken, productId: productKey });
  const { downloadUrl, version, kind } = tokenInfo;
  if (!downloadUrl) throw new Error('downloadUrl manquant');

  // Telechargement
  onProgress({ phase: 'download', percent: 0,
    message: `Les compagnons de ${product.name} font route vers ta Table...` });
  const ext = kind === 'exe-installer' ? '.exe' : '.zip';
  const tmpFile = path.join(os.tmpdir(), `triskell-${productKey}-${Date.now()}${ext}`);

  await downloadFile({
    url: downloadUrl,
    destPath: tmpFile,
    onProgress: ({ received, total }) => {
      const percent = total ? Math.round((received / total) * 100) : 0;
      onProgress({
        phase: 'download',
        percent,
        message: `Les compagnons de ${product.name} font route vers ta Table...`,
        detail: total
          ? `${formatMB(received)} / ${formatMB(total)} Mo (${percent}%)`
          : `${formatMB(received)} Mo téléchargés`
      });
    }
  });

  // Install
  if (kind === 'zip-bundle') {
    const installPath = path.join(
      homeDocuments(),
      product.installer.installPath || `Triskell/${productId}`
    );
    const toolCount = (product.tools && product.tools.length) || 0;
    const extractMsg = toolCount > 0
      ? `Mise en place des ${toolCount} compagnons...`
      : 'Mise en place à ta Table...';
    onProgress({ phase: 'extract', percent: 95, message: extractMsg,
      detail: `Dossier : ${installPath}` });

    // On nettoie le dossier cible avant extraction (install propre).
    if (fs.existsSync(installPath)) fs.rmSync(installPath, { recursive: true, force: true });
    fs.mkdirSync(installPath, { recursive: true });

    await extractZipWindows(tmpFile, installPath);
    flattenIfSingleFolder(installPath);
    try { fs.unlinkSync(tmpFile); } catch (_) {}

    const doneMsg = toolCount > 0
      ? `${toolCount} compagnons ont rejoint ta Table`
      : `${product.name} a rejoint ta Table`;
    onProgress({ phase: 'done', percent: 100, message: doneMsg, detail: '' });
    return { installPath, version, kind };
  }

  if (kind === 'exe-installer') {
    onProgress({ phase: 'install', percent: 60,
      message: 'L\'installeur prend le relais...',
      detail: 'Suis ses instructions à l\'écran si une fenêtre s\'ouvre.' });
    await runExeInstaller(tmpFile);
    try { fs.unlinkSync(tmpFile); } catch (_) {}

    // Verification post-install : NSIS/Inno renvoient code 0 meme apres
    // annulation/erreur (cf. runExeInstaller). On valide donc en regardant
    // que l'exe attendu existe vraiment sur disque, sinon on refuse
    // d'enregistrer l'install (sinon la tuile passe a "Convoquer" et le
    // clic suivant donne "Lancement impossible").
    const mainExe = resolveLocalUserPath(tokenInfo.expectedExePath);
    if (!mainExe) {
      throw new Error('install incomplete: backend has not provided expectedExePath');
    }
    onProgress({ phase: 'install', percent: 90,
      message: 'Vérification de l\'installation...', detail: '' });
    const found = await waitForExe(mainExe);
    if (!found) {
      throw new Error('install incomplete: ' + mainExe + ' not found after installer exit (annulation ou erreur ?)');
    }

    onProgress({ phase: 'done', percent: 100,
      message: `${product.name} a rejoint ta Table`, detail: '' });
    return { installPath: path.dirname(mainExe), mainExe, version, kind };
  }

  throw new Error(`installer kind inconnu: ${kind}`);
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

module.exports = {
  installProduct
};
