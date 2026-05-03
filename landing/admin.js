// Admin dashboard — login email/code + appel /api/admin/dashboard.
'use strict';

(function () {
  const API = 'https://api.triskell-studio.fr';
  const LS_KEY = 'triskell_admin_jwt';

  const $ = (id) => document.getElementById(id);

  const els = {
    loginScreen:    $('admin-login'),
    dashboard:      $('admin-dashboard'),
    emailForm:      $('login-email-form'),
    emailInput:     $('login-email'),
    emailBtn:       $('login-email-btn'),
    codeForm:       $('login-code-form'),
    codeInput:      $('login-code'),
    codeBtn:        $('login-code-btn'),
    backBtn:        $('login-back-btn'),
    error:          $('login-error'),
    refreshBtn:     $('refresh-btn'),
    logoutBtn:      $('logout-btn'),
    emailLabel:     $('admin-email-label'),
    tUsers:         $('t-users'),
    tLicenses:      $('t-licenses'),
    tInterests:     $('t-interests'),
    tCodes:         $('t-codes'),
    chartWrap:      $('chart-wrap'),
    recentUsers:    $('t-recent-users').querySelector('tbody'),
    recentLicenses: $('t-recent-licenses').querySelector('tbody'),
    interestsHost:  $('interests-by-product')
  };

  let state = { jwt: null, email: null };

  init();

  function init() {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        state.jwt = parsed.jwt;
        state.email = parsed.email;
      } catch (_) { localStorage.removeItem(LS_KEY); }
    }
    if (state.jwt) {
      enterDashboard();
    } else {
      bindLogin();
    }
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.remove('hidden');
  }
  function clearError() {
    els.error.textContent = '';
    els.error.classList.add('hidden');
  }

  function bindLogin() {
    els.emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = els.emailInput.value.trim().toLowerCase();
      if (!email) return;
      els.emailBtn.disabled = true;
      els.emailBtn.textContent = 'Envoi…';
      clearError();
      try {
        const res = await fetch(`${API}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) {
          showError(humanize(data.error) || 'Erreur serveur');
        } else {
          state.email = email;
          els.emailForm.classList.add('hidden');
          els.codeForm.classList.remove('hidden');
          setTimeout(() => els.codeInput.focus(), 50);
        }
      } catch (err) {
        showError('Pas de connexion au serveur.');
      } finally {
        els.emailBtn.disabled = false;
        els.emailBtn.textContent = 'Recevoir un code';
      }
    });

    els.codeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = els.codeInput.value.replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        showError('Code à 6 chiffres requis.');
        return;
      }
      els.codeBtn.disabled = true;
      els.codeBtn.textContent = 'Vérification…';
      clearError();
      try {
        const res = await fetch(`${API}/api/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: state.email, code })
        });
        const data = await res.json();
        if (!res.ok) {
          showError(humanize(data.error) || 'Code invalide');
        } else {
          state.jwt = data.token;
          localStorage.setItem(LS_KEY, JSON.stringify({ jwt: state.jwt, email: state.email }));
          enterDashboard();
        }
      } catch (err) {
        showError('Erreur réseau.');
      } finally {
        els.codeBtn.disabled = false;
        els.codeBtn.textContent = 'Entrer';
      }
    });

    els.backBtn.addEventListener('click', () => {
      els.codeForm.classList.add('hidden');
      els.emailForm.classList.remove('hidden');
      clearError();
    });
  }

  function humanize(code) {
    switch (code) {
      case 'invalid-email':     return 'Email invalide.';
      case 'too-many-requests': return 'Trop de demandes. Attends une heure.';
      case 'wrong-code':        return 'Code incorrect.';
      case 'no-active-code':    return 'Aucun code valide. Redemande un nouveau code.';
      case 'forbidden':         return 'Cet email n\'est pas autorisé sur l\'admin.';
      default: return null;
    }
  }

  async function enterDashboard() {
    els.loginScreen.classList.add('hidden');
    els.dashboard.classList.remove('hidden');

    els.refreshBtn.addEventListener('click', loadDashboard);
    els.logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(LS_KEY);
      location.reload();
    });

    loadDashboard();
  }

  async function loadDashboard() {
    els.refreshBtn.disabled = true;
    try {
      const res = await fetch(`${API}/api/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${state.jwt}` }
      });
      if (res.status === 401 || res.status === 403) {
        // Token expiré ou pas admin
        localStorage.removeItem(LS_KEY);
        showError('Accès refusé. Reconnecte-toi.');
        location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'server-error');
      render(data);
    } catch (err) {
      console.error(err);
      alert('Impossible de charger le dashboard : ' + err.message);
    } finally {
      els.refreshBtn.disabled = false;
    }
  }

  function render(d) {
    if (els.emailLabel) els.emailLabel.textContent = d.admin?.email || state.email;

    // Totaux
    els.tUsers.textContent     = d.totals.users;
    els.tLicenses.textContent  = d.totals.licenses_active;
    els.tInterests.textContent = d.totals.interests;
    els.tCodes.textContent     = d.totals.login_codes_24h;

    // Graphique 30j (barres empilées comptes / licences)
    renderChart(d.series_30d || []);

    // Derniers comptes
    els.recentUsers.innerHTML = (d.recent_users || []).length
      ? d.recent_users.map(u => `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td>${formatDate(u.created_at)}</td>
            <td>${u.last_login_at ? formatDate(u.last_login_at) : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="empty-msg">Aucun compte pour l\'instant.</td></tr>';

    // Dernières licences
    els.recentLicenses.innerHTML = (d.recent_licenses || []).length
      ? d.recent_licenses.map(l => `
          <tr>
            <td>${escapeHtml(l.email)}</td>
            <td>${escapeHtml(l.product_key)}${l.status === 'active' ? '' : ' <span class="muted small">(' + escapeHtml(l.status) + ')</span>'}</td>
            <td>${formatDate(l.purchased_at)}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="empty-msg">Aucune licence pour l\'instant.</td></tr>';

    // Intérêts par produit
    renderInterests(d.interests_by_product || {});
  }

  function renderChart(series) {
    const max = Math.max(1, ...series.map(s => s.users + s.licenses));
    els.chartWrap.innerHTML = series.map(s => {
      const userPct = (s.users / max) * 100;
      const licPct  = (s.licenses / max) * 100;
      const totalPct = userPct + licPct;
      return `
        <div class="chart-bar" style="height:${Math.max(2, totalPct)}%" data-tooltip="${s.day} · ${s.users} compte${s.users>1?'s':''} · ${s.licenses} licence${s.licenses>1?'s':''}">
          <div class="seg-licenses" style="height:${(licPct/totalPct||0)*100}%"></div>
          <div class="seg-users" style="height:${(userPct/totalPct||0)*100}%"></div>
        </div>`;
    }).join('');
  }

  function renderInterests(byProduct) {
    const keys = Object.keys(byProduct);
    if (keys.length === 0) {
      els.interestsHost.innerHTML = '<p class="empty-msg">Aucun intérêt capté pour l\'instant.</p>';
      return;
    }
    els.interestsHost.innerHTML = keys.map(p => {
      const items = byProduct[p];
      const emails = items.map(i => i.email).join(', ');
      return `
        <div class="interest-product">
          <div class="interest-product-head" data-toggle>
            <div>
              <span class="interest-product-name">${escapeHtml(p)}</span>
              <span class="interest-count-badge">${items.length}</span>
            </div>
            <div class="interest-product-actions">
              <button class="btn-ghost-sm" data-copy="${escapeHtml(emails)}">Copier emails</button>
            </div>
          </div>
          <div class="interest-emails hidden">${escapeHtml(emails)}</div>
        </div>`;
    }).join('');

    els.interestsHost.querySelectorAll('[data-toggle]').forEach(head => {
      head.addEventListener('click', (e) => {
        if (e.target.dataset.copy !== undefined) return; // copy bouton, ignore toggle
        const next = head.nextElementSibling;
        if (next) next.classList.toggle('hidden');
      });
    });
    els.interestsHost.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
          const orig = btn.textContent;
          btn.textContent = 'Copié ✓';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        } catch (_) { /* clipboard refusé */ }
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }
})();
