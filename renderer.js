// Triskell Lanceur - renderer (UI)
// Flux : login -> fetch licences + installs -> rendu de la grille de tuiles
'use strict';

(function () {

  // ============================================================================
  // ETAT
  // ============================================================================
  const state = {
    apps: [],
    categories: [],
    licenses: {},      // { productKey: true }
    installs: {},      // { productId: { installPath, mainExe, version } }
    user: null,
    activeCategory: 'all',
    query: '',
    installing: new Set()   // ids des produits en cours d'install
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    // login
    loginScreen:   $('login-screen'),
    loginEmailForm: $('login-email-form'),
    loginCodeForm:  $('login-code-form'),
    loginEmail:    $('login-email'),
    loginEmailBtn: $('login-email-btn'),
    loginCode:     $('login-code'),
    loginCodeBtn:  $('login-code-btn'),
    loginBackBtn:  $('login-back-btn'),
    loginSentEmail:$('login-sent-email'),
    loginError:    $('login-error'),
    loginVersion:  $('login-version'),
    // app
    appScreen:    $('app-screen'),
    grid:         $('grid'),
    search:       $('search-input'),
    cats:         $('categories'),
    title:        $('main-title'),
    count:        $('main-count'),
    empty:        $('empty-state'),
    loading:      $('loading-state'),
    accountBtn:   $('account-btn'),
    accountEmail: $('account-email'),
    metaText:     $('meta-text'),
    // modal generique
    modal:        $('modal'),
    modalTitle:   $('modal-title'),
    modalBody:    $('modal-body'),
    modalCta:     $('modal-cta'),
    modalCancel:  $('modal-cancel'),
    // modal install
    installModal:    $('install-modal'),
    installTitle:    $('install-title'),
    installStep:     $('install-step'),
    installProgress: $('install-progress'),
    installDetail:   $('install-detail'),
    installCancel:   $('install-cancel')
  };

  // ============================================================================
  // BOOT
  // ============================================================================
  init().catch(err => showFatalError(err.message));

  async function init() {
    bindModal();
    bindInstallProgress();

    const meta = await window.triskell.getMeta();
    els.loginVersion.textContent = `Triskell Studio · v${meta.version}`;
    els.metaText.textContent = `Triskell Studio · v${meta.version}`;

    const session = await window.triskell.auth.getSession();
    if (session && session.user) {
      state.user = session.user;
      await enterApp();
    } else {
      showLogin();
    }
  }

  // ============================================================================
  // ECRAN DE LOGIN
  // ============================================================================
  function showLogin() {
    els.loginScreen.classList.remove('hidden');
    els.appScreen.classList.add('hidden');
    showLoginEmailStep();
    bindLogin();
  }

  function hideLogin() {
    els.loginScreen.classList.add('hidden');
    els.appScreen.classList.remove('hidden');
  }

  function showLoginEmailStep() {
    els.loginEmailForm.classList.remove('hidden');
    els.loginCodeForm.classList.add('hidden');
    clearLoginError();
    setTimeout(() => els.loginEmail.focus(), 50);
  }

  function showLoginCodeStep(email) {
    els.loginEmailForm.classList.add('hidden');
    els.loginCodeForm.classList.remove('hidden');
    els.loginSentEmail.textContent = email;
    clearLoginError();
    setTimeout(() => els.loginCode.focus(), 50);
  }

  function setLoginError(msg) {
    els.loginError.textContent = msg;
    els.loginError.classList.remove('hidden');
  }

  function clearLoginError() {
    els.loginError.textContent = '';
    els.loginError.classList.add('hidden');
  }

  let loginBound = false;
  function bindLogin() {
    if (loginBound) return;
    loginBound = true;

    els.loginEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = els.loginEmail.value.trim().toLowerCase();
      if (!email) return;

      els.loginEmailBtn.disabled = true;
      els.loginEmailBtn.textContent = 'Envoi...';
      clearLoginError();

      const res = await window.triskell.auth.login(email);

      els.loginEmailBtn.disabled = false;
      els.loginEmailBtn.textContent = 'Recevoir mon code';

      if (!res.ok) {
        setLoginError(humanizeAuthError(res.error) + (res.message ? ` (${res.message})` : ''));
        return;
      }
      showLoginCodeStep(email);
    });

    els.loginCodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = els.loginCode.value.replace(/\s/g, '');
      const email = els.loginSentEmail.textContent;
      if (!/^\d{6}$/.test(code)) {
        setLoginError('Le code fait 6 chiffres.');
        return;
      }

      els.loginCodeBtn.disabled = true;
      els.loginCodeBtn.textContent = 'Vérification...';
      clearLoginError();

      const res = await window.triskell.auth.verify(email, code);

      els.loginCodeBtn.disabled = false;
      els.loginCodeBtn.textContent = 'Me connecter';

      if (!res.ok) {
        setLoginError(humanizeAuthError(res.error));
        return;
      }
      state.user = res.user;
      hideLogin();
      enterApp();
    });

    els.loginBackBtn.addEventListener('click', () => {
      els.loginCode.value = '';
      showLoginEmailStep();
    });
  }

  function humanizeAuthError(code) {
    switch (code) {
      case 'invalid-email':       return 'Email invalide.';
      case 'too-many-requests':   return 'Trop de demandes. Attends une heure.';
      case 'no-active-code':      return 'Aucun code valide. Redemande un nouveau code.';
      case 'wrong-code':          return 'Code incorrect.';
      case 'too-many-attempts':   return 'Trop d\'essais. Redemande un nouveau code.';
      case 'mail-failed':         return 'Impossible d\'envoyer l\'email. Réessaie dans une minute.';
      case 'network':             return 'Pas de connexion au serveur Triskell.';
      default:                    return 'Une erreur est survenue.';
    }
  }

  // ============================================================================
  // APP : chargement initial + rendu
  // ============================================================================
  async function enterApp() {
    hideLogin();
    els.loading.classList.remove('hidden');

    const cat = await window.triskell.getApps();
    if (cat.error) {
      showFatalError('Catalogue introuvable : ' + cat.error);
      return;
    }
    state.apps = cat.apps || [];
    state.categories = cat.categories || [];

    const [licRes, installs] = await Promise.all([
      window.triskell.licenses.fetch(),
      window.triskell.installs.list()
    ]);

    if (!licRes.ok && licRes.error === 'session-expired') {
      state.user = null;
      showLogin();
      return;
    }

    state.licenses = {};
    if (licRes.ok && Array.isArray(licRes.licenses)) {
      for (const l of licRes.licenses) state.licenses[l.product_key] = true;
    }
    state.installs = installs || {};

    els.accountEmail.textContent = state.user.email;
    els.accountBtn.title = state.user.email;

    bindHeader();
    renderCategories();
    render();
    els.loading.classList.add('hidden');
  }

  // ============================================================================
  // HEADER
  // ============================================================================
  let headerBound = false;
  function bindHeader() {
    if (headerBound) return;
    headerBound = true;

    els.search.addEventListener('input', (e) => {
      state.query = e.target.value.trim().toLowerCase();
      render();
    });

    els.accountBtn.addEventListener('click', openAccountMenu);
  }

  function openAccountMenu() {
    openModal({
      title: 'Mon compte Triskell',
      bodyHtml: `
        <p class="muted">Connecté avec <strong style="color:var(--accent)">${escapeHtml(state.user.email)}</strong></p>
        <p class="muted">Tu possèdes <strong>${Object.keys(state.licenses).length}</strong> licence${Object.keys(state.licenses).length > 1 ? 's' : ''}.</p>
      `,
      ctaLabel: 'Me déconnecter',
      ctaKind: 'danger',
      onCta: async () => {
        await window.triskell.auth.logout();
        state.user = null;
        state.licenses = {};
        closeModal();
        showLogin();
      }
    });
  }

  // ============================================================================
  // SIDEBAR
  // ============================================================================
  function renderCategories() {
    els.cats.innerHTML = '';
    for (const cat of state.categories) {
      const count = cat.id === 'all'
        ? state.apps.length
        : state.apps.filter(a => a.category === cat.id).length;

      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (cat.id === state.activeCategory ? ' active' : '');
      btn.dataset.cat = cat.id;
      btn.innerHTML = `<span>${escapeHtml(cat.label)}</span><span class="cat-count">${count}</span>`;
      btn.addEventListener('click', () => {
        state.activeCategory = cat.id;
        document.querySelectorAll('.cat-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.cat === cat.id));
        render();
      });
      els.cats.appendChild(btn);
    }
  }

  // ============================================================================
  // GRID
  // ============================================================================
  function render() {
    const filtered = filterApps();
    const cat = state.categories.find(c => c.id === state.activeCategory);
    els.title.textContent = cat
      ? (cat.id === 'all' ? 'Tous tes outils' : cat.label)
      : 'Outils';
    els.count.textContent = `${filtered.length} outil${filtered.length > 1 ? 's' : ''}`;

    els.grid.innerHTML = '';
    if (filtered.length === 0) {
      els.empty.classList.remove('hidden');
      return;
    }
    els.empty.classList.add('hidden');

    const frag = document.createDocumentFragment();
    for (const app of filtered) frag.appendChild(buildTile(app));
    els.grid.appendChild(frag);
  }

  function filterApps() {
    return state.apps.filter(app => {
      if (state.activeCategory !== 'all' && app.category !== state.activeCategory) return false;
      if (state.query) {
        const hay = (app.name + ' ' + (app.tagline || '')).toLowerCase();
        if (!hay.includes(state.query)) return false;
      }
      return true;
    });
  }

  // Determine l'etat affiche d'un produit, et donc les actions disponibles.
  function tileStateOf(app) {
    if (app.comingSoon) return 'coming-soon';
    if (state.installing.has(app.id)) return 'installing';
    const installed = !!state.installs[app.id];
    const owned = app.tier === 'free' || !!state.licenses[app.id];
    if (installed) return 'installed';
    if (owned) return 'owned-not-installed';
    return 'not-owned';
  }

  function buildTile(app) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.id = app.id;

    const tileState = tileStateOf(app);
    const initials = makeInitials(app.name);

    const tags = [];
    if (app.tier === 'free')                                     tags.push('<span class="tag tag-free">Gratuit</span>');
    if (state.licenses[app.id])                                  tags.push('<span class="tag tag-owned">Possédé</span>');
    if (app.comingSoon)                                          tags.push('<span class="tag tag-soon">Bientôt</span>');
    if (state.installs[app.id] && !app.comingSoon)               tags.push('<span class="tag tag-installed">Installé</span>');

    tile.innerHTML = `
      <div class="tile-head">
        <div class="tile-icon" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="tile-title-block">
          <h3 class="tile-title">${escapeHtml(app.name)}</h3>
          <p class="tile-tagline">${escapeHtml(app.tagline || '')}</p>
        </div>
      </div>
      <div class="tile-tags">${tags.join('')}</div>
      <div class="tile-actions"></div>
    `;

    const actions = tile.querySelector('.tile-actions');
    renderTileActions(actions, app, tileState);
    return tile;
  }

  function renderTileActions(host, app, tileState) {
    host.innerHTML = '';
    switch (tileState) {
      case 'coming-soon': {
        host.appendChild(makeBtn('Bientôt disponible', 'btn-disabled', null, true));
        break;
      }
      case 'installing': {
        host.appendChild(makeBtn('Installation...', 'btn-installing', null, true));
        break;
      }
      case 'installed': {
        host.appendChild(makeBtn('Lancer', 'btn-launch', () => onLaunch(app)));
        host.appendChild(makeBtn('Infos', 'btn-info', () => onInfo(app)));
        break;
      }
      case 'owned-not-installed': {
        host.appendChild(makeBtn('Installer', 'btn-launch', () => onInstall(app)));
        host.appendChild(makeBtn('Infos', 'btn-info', () => onInfo(app)));
        break;
      }
      case 'not-owned':
      default: {
        if (app.buyUrl) {
          host.appendChild(makeBtn('Acheter', 'btn-buy',
            () => window.triskell.openExternal(app.buyUrl)));
        } else {
          host.appendChild(makeBtn('Bientôt en vente', 'btn-disabled', null, true));
        }
        host.appendChild(makeBtn('En savoir plus', 'btn-info', () => onInfo(app)));
        break;
      }
    }
  }

  function makeBtn(label, klass, handler, disabled = false) {
    const b = document.createElement('button');
    b.className = klass;
    b.textContent = label;
    if (disabled) b.disabled = true;
    if (handler) b.addEventListener('click', handler);
    return b;
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================
  async function onLaunch(app) {
    const res = await window.triskell.launch.product(app.id);
    if (!res.ok) {
      openModal({
        title: 'Lancement impossible',
        body: humanizeLaunchError(res),
        ctaLabel: 'OK'
      });
    }
  }

  async function onInstall(app) {
    state.installing.add(app.id);
    render();
    showInstallModal(app.name);

    const res = await window.triskell.install.start(app.id);

    state.installing.delete(app.id);

    if (res.ok) {
      state.installs[app.id] = {
        installPath: res.installPath,
        mainExe: res.mainExe,
        version: res.version
      };
      hideInstallModal();
      render();
      openModal({
        title: `${app.name} installé`,
        body: `Tu peux maintenant lancer ${app.name} depuis ta grille.`,
        ctaLabel: 'Super'
      });
    } else {
      hideInstallModal();
      render();
      openModal({
        title: 'Installation échouée',
        body: humanizeInstallError(res),
        ctaLabel: 'Fermer'
      });
    }
  }

  function onInfo(app) {
    const owned = state.licenses[app.id] || app.tier === 'free';
    const installed = !!state.installs[app.id];

    let toolsHtml = '';
    if (Array.isArray(app.tools) && app.tools.length) {
      toolsHtml = `
        <p class="muted" style="margin-top:14px;font-weight:600;">Outils inclus :</p>
        <ul style="padding-left:18px;margin:6px 0 0;">
          ${app.tools.map(t =>
            `<li class="muted small"><strong style="color:var(--text);">${escapeHtml(t.name)}</strong> — ${escapeHtml(t.tagline)}</li>`
          ).join('')}
        </ul>
      `;
    }

    openModal({
      title: app.name,
      bodyHtml: `
        <p class="muted">${escapeHtml(app.tagline || '')}</p>
        <p class="muted small">Statut : ${owned ? '<strong style="color:var(--green)">possédé</strong>' : 'non acquis'}${installed ? ' · installé' : ''}</p>
        ${toolsHtml}
      `,
      ctaLabel: 'OK'
    });
  }

  function humanizeLaunchError(res) {
    if (res.error === 'not-installed') return 'Cet outil n\'est pas encore installé.';
    if (res.error === 'not-found')     return `Le fichier .exe est introuvable : ${res.exePath || ''}`;
    if (res.error === 'spawn-failed')  return `Erreur de lancement : ${res.message || ''}`;
    return 'Lancement impossible.';
  }

  function humanizeInstallError(res) {
    if (res.error === 'not-authenticated') return 'Tu n\'es plus connecté. Reconnecte-toi.';
    if (res.error === 'install-failed')    return `Erreur pendant l'installation : ${res.message || ''}`;
    return 'L\'installation a échoué.';
  }

  // ============================================================================
  // MODALES
  // ============================================================================
  function bindModal() {
    els.modal.addEventListener('click', (e) => {
      if (e.target.dataset && 'close' in e.target.dataset) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.modal.classList.contains('hidden')) closeModal();
    });
  }

  function openModal({ title, body, bodyHtml, ctaLabel, ctaKind, onCta }) {
    els.modalTitle.textContent = title;
    if (bodyHtml) {
      els.modalBody.innerHTML = bodyHtml;
    } else {
      els.modalBody.style.whiteSpace = 'pre-line';
      els.modalBody.textContent = body || '';
    }
    els.modalCta.textContent = ctaLabel || 'OK';
    els.modalCta.classList.toggle('outline', ctaKind === 'danger');
    els.modalCta.onclick = onCta || closeModal;
    els.modal.classList.remove('hidden');
  }

  function closeModal() {
    els.modal.classList.add('hidden');
    els.modalBody.style.whiteSpace = '';
  }

  function bindInstallProgress() {
    window.triskell.install.onProgress((data) => {
      if (els.installModal.classList.contains('hidden')) return;
      els.installStep.textContent = data.message || '';
      els.installDetail.textContent = data.detail || '';
      const percent = typeof data.percent === 'number'
        ? Math.max(0, Math.min(100, data.percent))
        : 0;
      els.installProgress.style.width = percent + '%';
    });

    els.installCancel.addEventListener('click', () => {
      // V1 : on masque la modale ; le téléchargement continue en arrière-plan.
      // V2 : on ajoutera un vrai mécanisme d'annulation.
      hideInstallModal();
    });
  }

  function showInstallModal(productName) {
    els.installTitle.textContent = `Installation de ${productName}...`;
    els.installStep.textContent = 'Préparation...';
    els.installDetail.textContent = '';
    els.installProgress.style.width = '0%';
    els.installModal.classList.remove('hidden');
  }

  function hideInstallModal() {
    els.installModal.classList.add('hidden');
  }

  // ============================================================================
  // HELPERS
  // ============================================================================
  function makeInitials(name) {
    const parts = (name || '').replace(/^Le\s+|^La\s+|^Les\s+|^L'/i, '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function showFatalError(msg) {
    els.loading.innerHTML =
      `<div class="empty-mark">!</div><h2>Erreur</h2><p>${escapeHtml(msg)}</p>`;
    els.loading.classList.remove('hidden');
  }
})();
