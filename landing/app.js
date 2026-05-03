// Resout l'URL du dernier .exe Windows publie sur GitHub Releases.
// Fallback sur la page /releases/latest si l'API echoue ou n'a pas de .exe.
'use strict';

(function () {
  const REPO = 'Jordan-Bourillot/triskell-lanceur';
  const btn = document.getElementById('download-btn');
  const meta = document.getElementById('download-meta');
  if (!btn) return;

  const fallback = btn.dataset.fallback
    || `https://github.com/${REPO}/releases/latest`;
  btn.href = fallback;

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
    .catch(() => { /* fallback deja en place */ });
})();
