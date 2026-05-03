// Resout l'URL du dernier .exe Windows.
// Strategie : 1) GitHub Releases si dispo (pour electron-updater + nouvelles versions),
//             2) sinon fallback sur le .exe servi en CDN par Netlify (toujours dispo).
'use strict';

(function () {
  const REPO = 'Jordan-Bourillot/triskell-table-ronde';
  const NETLIFY_FALLBACK = '/_dl/La-Table-Ronde-Setup.exe';
  const btn = document.getElementById('download-btn');
  const meta = document.getElementById('download-meta');
  if (!btn) return;

  // Fallback immediat : on pointe sur le .exe Netlify pour que le bouton
  // marche meme avant que GitHub Releases existe.
  btn.href = NETLIFY_FALLBACK;
  if (meta) meta.textContent = 'v0.1.0 · ~82 Mo · Windows 64 bits';

  // Si une release GitHub plus recente existe, on prefere celle-la
  // (electron-updater pourra suivre les MAJ depuis GitHub).
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then(r => r.ok ? r.json() : null)
    .then(release => {
      if (!release || !Array.isArray(release.assets)) return;
      const exe = release.assets.find(a => /\.exe$/i.test(a.name));
      if (!exe) return;
      btn.href = exe.browser_download_url;
      if (meta) {
        const sizeMB = (exe.size / (1024 * 1024)).toFixed(1);
        meta.textContent = `v${release.tag_name.replace(/^v/, '')} · ${sizeMB} Mo · Windows 64 bits`;
      }
    })
    .catch(() => { /* le fallback Netlify reste actif */ });
})();
