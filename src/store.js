// Persistance simple a base de fichiers JSON dans app.getPath('userData').
// - session.json : { token, user, savedAt }
// - installs.json : { [productId]: { installPath, mainExe, version, installedAt } }
'use strict';

const fs = require('fs');
const path = require('path');

let userDataDir = null;

function init(dir) {
  userDataDir = dir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pathFor(name) {
  if (!userDataDir) throw new Error('store not initialized');
  return path.join(userDataDir, name);
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(pathFor(file), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = pathFor(file) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, pathFor(file));
}

// ---------- Session ----------
function getSession() {
  const s = readJson('session.json', null);
  if (!s || !s.token || !s.user) return null;
  return s;
}

function setSession({ token, user }) {
  writeJson('session.json', { token, user, savedAt: Date.now() });
}

function clearSession() {
  try { fs.unlinkSync(pathFor('session.json')); } catch (_) { /* ok */ }
}

// ---------- Installations ----------
function getInstalls() {
  return readJson('installs.json', {});
}

function setInstall(productId, info) {
  const all = getInstalls();
  all[productId] = { ...info, installedAt: Date.now() };
  writeJson('installs.json', all);
}

function removeInstall(productId) {
  const all = getInstalls();
  delete all[productId];
  writeJson('installs.json', all);
}

module.exports = {
  init,
  getSession,
  setSession,
  clearSession,
  getInstalls,
  setInstall,
  removeInstall
};
