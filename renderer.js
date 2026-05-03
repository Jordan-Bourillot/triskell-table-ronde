// Triskell Lanceur - renderer (UI)
// Flux : login -> fetch licences + installs -> rendu de la grille de tuiles
'use strict';

(function () {

  // ============================================================================
  // ETAT
  // ============================================================================
  const state = {
    apps: [],
    bundles: [],
    licenses: {},      // { productKey: true }
    installs: {},      // { productId: { installPath, mainExe, version } }
    versions: {},      // { productId: latestVersion } depuis apps.json
    user: null,
    installing: new Set(),
    updateInfo: '',
    promoNote: '',
    offline: false,    // true si licences viennent du cache
    prefs: { autoLaunch: false, telemetry: false, lastUsed: [] }
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
    installCancel:   $('install-cancel'),
    // toasts
    toasts:          $('toasts')
  };

  // ============================================================================
  // BOOT
  // ============================================================================
  init().catch(err => showFatalError(err.message));

  async function init() {
    bindModal();
    bindInstallProgress();
    bindUpdateStatus();
    bindPurchaseCompleted();

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
    state.bundles = cat.bundles || [];
    state.promoNote = cat.promoNote || '';
    state.versions = (cat.apps || []).reduce((acc, a) => {
      if (a.latestVersion) acc[a.id] = a.latestVersion;
      return acc;
    }, {});

    const [licRes, installs, prefs, versions] = await Promise.all([
      window.triskell.licenses.fetch(),
      window.triskell.installs.list(),
      window.triskell.prefs ? window.triskell.prefs.get() : Promise.resolve({}),
      window.triskell.versions ? window.triskell.versions.fetch() : Promise.resolve({})
    ]);
    state.prefs = { autoLaunch: false, telemetry: false, lastUsed: [], ...prefs };
    state.versions = { ...state.versions, ...(versions || {}) };

    if (!licRes.ok && licRes.error === 'session-expired') {
      state.user = null;
      showLogin();
      return;
    }

    state.licenses = {};
    if (licRes.ok && Array.isArray(licRes.licenses)) {
      for (const l of licRes.licenses) state.licenses[l.product_key] = true;
    }
    state.offline = !!(licRes && licRes.fromCache);
    state.installs = installs || {};

    els.accountEmail.textContent = state.user.email;
    els.accountBtn.title = state.user.email;

    bindHeader();
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
    els.accountBtn.addEventListener('click', openAccountMenu);
  }

  function openAccountMenu() {
    const updateLine = state.updateInfo
      ? `<p class="muted small" id="update-line">${escapeHtml(state.updateInfo)}</p>`
      : `<p class="muted small" id="update-line"></p>`;

    const autoLaunch = !!state.prefs.autoLaunch;
    const telemetry = !!state.prefs.telemetry;

    openModal({
      title: 'Mon compte Triskell',
      bodyHtml: `
        <p class="muted">Connecté avec <strong style="color:var(--accent)">${escapeHtml(state.user.email)}</strong></p>
        <p class="muted">Tu possèdes <strong>${Object.keys(state.licenses).length}</strong> licence${Object.keys(state.licenses).length > 1 ? 's' : ''}.</p>

        <div class="account-section">
          <label class="pref-row">
            <span><strong>Lancer au démarrage de Windows</strong><br><span class="muted small">Triskell s'ouvre automatiquement quand tu allumes ton PC.</span></span>
            <input type="checkbox" id="pref-auto-launch" ${autoLaunch ? 'checked' : ''}>
          </label>
          <label class="pref-row">
            <span><strong>Statistiques anonymes</strong><br><span class="muted small">Aide Triskell à savoir ce qui est utilisé. Aucune donnée perso, aucun tracker.</span></span>
            <input type="checkbox" id="pref-telemetry" ${telemetry ? 'checked' : ''}>
          </label>
        </div>

        <div class="account-section">
          <button class="ghost-btn" id="check-updates-btn" type="button">Vérifier les mises à jour</button>
          ${updateLine}
        </div>
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

    const btn = document.getElementById('check-updates-btn');
    const line = document.getElementById('update-line');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        line.textContent = 'Recherche...';
        const r = await window.triskell.updates.check();
        if (!r.ok) {
          line.textContent = r.error === 'dev-mode'
            ? 'Auto-update actif uniquement sur version installee.'
            : 'Erreur lors de la verification.';
          btn.disabled = false;
        }
      });
    }

    const al = document.getElementById('pref-auto-launch');
    if (al) al.addEventListener('change', async (e) => {
      const r = await window.triskell.prefs.setAutoLaunch(e.target.checked);
      if (r && r.ok) state.prefs.autoLaunch = !!r.openAtLogin;
      else e.target.checked = state.prefs.autoLaunch;
    });

    const tl = document.getElementById('pref-telemetry');
    if (tl) tl.addEventListener('change', async (e) => {
      await window.triskell.prefs.setTelemetry(e.target.checked);
      state.prefs.telemetry = e.target.checked;
    });
  }

  // Quand un achat in-app aboutit (page success Stripe atteinte) on rafraichit
  // les licences pour que la tuile passe de "Acheter" a "Installer".
  function bindPurchaseCompleted() {
    if (!window.triskell.purchase) return;
    window.triskell.purchase.onCompleted(async (data) => {
      showToast({
        kind: 'success',
        title: 'Achat confirmé',
        message: 'Ta licence est en cours d\'activation...'
      });
      // Stripe webhook -> backend register-license -> notre /api/me. On laisse
      // 2s au backend pour rattraper avant le refresh.
      setTimeout(async () => {
        const r = await window.triskell.licenses.fetch();
        if (r && r.ok) {
          state.licenses = {};
          for (const l of (r.licenses || [])) state.licenses[l.product_key] = true;
          render();
          showToast({
            kind: 'success',
            title: 'Licence activée',
            message: 'Tu peux installer ton produit maintenant.'
          });
        }
      }, 2200);
    });
  }

  function bindUpdateStatus() {
    if (!window.triskell.updates) return;
    window.triskell.updates.onStatus((data) => {
      let msg = '';
      switch (data.phase) {
        case 'available':   msg = `Version ${data.version} disponible. Telechargement...`; break;
        case 'downloading': msg = `Telechargement... ${Math.round(data.percent || 0)}%`; break;
        case 'up-to-date':  msg = 'Tu es a jour.'; break;
        case 'ready':       msg = `Version ${data.version} prete a installer.`; break;
        case 'error':       msg = `Erreur: ${data.message || ''}`; break;
      }
      state.updateInfo = msg;
      const line = document.getElementById('update-line');
      if (line) line.textContent = msg;
    });
  }

  // ============================================================================
  // GRID + BANNERS + SEARCH
  // ============================================================================
  function render() {
    const apps = filteredApps();
    els.count.textContent = `${apps.length} outil${apps.length > 1 ? 's' : ''}`;

    renderHomeBanner();
    renderOfflineBadge();
    renderSearchBar();
    renderBundles();

    els.grid.innerHTML = '';
    if (apps.length === 0) {
      els.empty.classList.remove('hidden');
      return;
    }
    els.empty.classList.add('hidden');

    const frag = document.createDocumentFragment();
    for (const app of apps) frag.appendChild(buildTile(app));
    els.grid.appendChild(frag);
  }

  function filteredApps() {
    const q = (state.searchQuery || '').toLowerCase();
    if (!q) return state.apps;
    return state.apps.filter(a => {
      const hay = (a.name + ' ' + (a.tagline || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  // Bandeau personnalisé en haut : salutation + compte rendu + raccourcis derniers utilisés.
  function renderHomeBanner() {
    const main = document.querySelector('.main');
    let host = document.getElementById('home-banner');
    if (!host) {
      host = document.createElement('section');
      host.id = 'home-banner';
      host.className = 'home-banner';
      main.insertBefore(host, main.children[1] || null);
    }
    const installedCount = Object.keys(state.installs).length;
    const ownedCount = Object.keys(state.licenses).length;
    const firstName = (state.user.email || '').split('@')[0].split('.')[0]
      .replace(/[^a-zA-ZÀ-ÿ]/g, '');
    const hello = firstName ? `Salut ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}` : 'Salut';

    const lastUsed = (state.prefs.lastUsed || [])
      .map(id => state.apps.find(a => a.id === id))
      .filter(a => a && state.installs[a.id])
      .slice(0, 4);

    const lastUsedHtml = lastUsed.length
      ? `<div class="banner-shortcuts">
          <span class="muted small">Récents :</span>
          ${lastUsed.map(a => `<button class="banner-shortcut" data-id="${a.id}">${escapeHtml(a.name)}</button>`).join('')}
        </div>`
      : '';

    host.innerHTML = `
      <div class="banner-text">
        <h2>${escapeHtml(hello)} 👋</h2>
        <p class="muted small">${ownedCount} licence${ownedCount > 1 ? 's' : ''} · ${installedCount} outil${installedCount > 1 ? 's' : ''} installé${installedCount > 1 ? 's' : ''}.</p>
      </div>
      ${lastUsedHtml}
    `;
    host.querySelectorAll('.banner-shortcut').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = state.apps.find(x => x.id === btn.dataset.id);
        if (a) onLaunch(a);
      });
    });
  }

  function renderOfflineBadge() {
    const main = document.querySelector('.main');
    let host = document.getElementById('offline-badge');
    if (!state.offline) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'offline-badge';
      host.className = 'offline-badge';
      main.insertBefore(host, main.children[2] || null);
    }
    host.innerHTML = `<span>📡</span> Mode hors-ligne — licences chargées depuis le cache local.`;
  }

  // Affiche la barre de recherche uniquement quand le catalogue depasse 6 produits.
  function renderSearchBar() {
    const main = document.querySelector('.main');
    let host = document.getElementById('main-search');
    const shouldShow = state.apps.length >= 6;
    if (!shouldShow) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'main-search';
      host.className = 'main-search';
      host.innerHTML = `<input type="search" id="search-input" placeholder="Rechercher un outil..." autocomplete="off" />`;
      const grid = document.getElementById('grid');
      main.insertBefore(host, grid);
      host.querySelector('#search-input').addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        render();
      });
    }
  }

  // Bundles : cartes pleine-largeur au-dessus de la grille produit.
  function renderBundles() {
    const host = document.getElementById('bundles-section')
      || (() => {
        const el = document.createElement('section');
        el.id = 'bundles-section';
        el.className = 'bundles';
        const main = document.querySelector('.main');
        main.insertBefore(el, document.getElementById('grid'));
        return el;
      })();

    host.innerHTML = '';
    const bundles = (state.bundles || []).filter(b => {
      // masque le bundle si tous les produits inclus sont deja possedes
      const owned = (b.apps || []).every(id => state.licenses[id]);
      return !owned;
    });
    if (bundles.length === 0) return;

    for (const b of bundles) {
      const card = document.createElement('article');
      card.className = 'bundle-card' + (b.comingSoon ? ' bundle-soon' : '');
      const original = b.priceOriginal && b.priceOriginal > b.price
        ? `<span class="price-old">${b.priceOriginal} €</span>` : '';
      const note = b.priceNote ? `<p class="bundle-note">${escapeHtml(b.priceNote)}</p>` : '';
      card.innerHTML = `
        <div class="bundle-icon"></div>
        <div class="bundle-body">
          <div class="bundle-tags">
            <span class="tag tag-suite">Bundle</span>
            ${b.comingSoon ? '<span class="tag tag-soon">En quête</span>' : ''}
          </div>
          <h3 class="bundle-title">${escapeHtml(b.name)}</h3>
          <p class="bundle-tagline">${escapeHtml(b.tagline || '')}</p>
          <div class="bundle-price">
            <span class="price-current">${b.price} €</span>
            ${original}
          </div>
          ${note}
        </div>
        <div class="bundle-actions"></div>
      `;
      if (b.icon) {
        const iconBox = card.querySelector('.bundle-icon');
        const img = document.createElement('img');
        img.alt = '';
        img.src = b.icon;
        iconBox.appendChild(img);
      }
      const actions = card.querySelector('.bundle-actions');
      if (b.comingSoon || !b.buyUrl) {
        const btn = makeBtn('Bientôt', 'btn-disabled', null, true);
        actions.appendChild(btn);
      } else {
        actions.appendChild(makeBtn('Recruter le bundle', 'btn-buy',
          () => window.triskell.openExternal(b.buyUrl)));
      }
      host.appendChild(card);
    }
  }

  // Determine l'etat affiche d'un produit, et donc les actions disponibles.
  function tileStateOf(app) {
    if (app.comingSoon) return 'coming-soon';
    if (state.installing.has(app.id)) return 'installing';
    const installed = !!state.installs[app.id];
    const owned = app.tier === 'free' || !!state.licenses[app.id];
    if (installed) {
      const localVer = state.installs[app.id].version;
      const latest = state.versions[app.id];
      if (latest && localVer && latest !== localVer) return 'update-available';
      return 'installed';
    }
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
    if (state.licenses[app.id])                                  tags.push('<span class="tag tag-owned">Adoubé</span>');
    if (app.comingSoon)                                          tags.push('<span class="tag tag-soon">En quête</span>');
    if (state.installs[app.id] && !app.comingSoon)               tags.push('<span class="tag tag-installed">À ta Table</span>');
    if (tileStateOf(app) === 'update-available')                 tags.push('<span class="tag tag-update">Mise à jour</span>');

    const ownedAlready = state.licenses[app.id];
    const priceHtml = renderPriceBlock(app, ownedAlready);

    tile.innerHTML = `
      <div class="tile-head">
        <div class="tile-icon" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="tile-title-block">
          <h3 class="tile-title">${escapeHtml(app.name)}</h3>
          <p class="tile-tagline">${escapeHtml(app.tagline || '')}</p>
        </div>
      </div>
      <div class="tile-tags">${tags.join('')}</div>
      ${priceHtml}
      <div class="tile-actions"></div>
    `;

    if (app.icon) {
      const iconBox = tile.querySelector('.tile-icon');
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', () => {
        iconBox.textContent = initials;
      });
      img.src = app.icon;
      iconBox.textContent = '';
      iconBox.appendChild(img);
    }

    const actions = tile.querySelector('.tile-actions');
    renderTileActions(actions, app, tileState);
    return tile;
  }

  function renderTileActions(host, app, tileState) {
    host.innerHTML = '';
    switch (tileState) {
      case 'coming-soon': {
        host.appendChild(makeBtn('En quête...', 'btn-disabled', null, true));
        break;
      }
      case 'installing': {
        host.appendChild(makeBtn('Installation...', 'btn-installing', null, true));
        break;
      }
      case 'installed': {
        host.appendChild(makeBtn('Convoquer', 'btn-launch', () => onLaunch(app)));
        host.appendChild(makeBtn('Infos', 'btn-info', () => onInfo(app)));
        break;
      }
      case 'update-available': {
        host.appendChild(makeBtn('Mettre à jour', 'btn-launch', () => onInstall(app)));
        host.appendChild(makeBtn('Convoquer', 'btn-info', () => onLaunch(app)));
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
          host.appendChild(makeBtn('Recruter', 'btn-buy',
            () => onBuy(app)));
        } else {
          host.appendChild(makeBtn('Bientôt en vente', 'btn-disabled', null, true));
        }
        host.appendChild(makeBtn('En savoir plus', 'btn-info', () => onInfo(app)));
        break;
      }
    }
  }

  // Achat in-app : ouvre une fenetre Electron sur le checkout Stripe. Quand le
  // user revient sur /success, on ferme et on rafraichit ses licences.
  function onBuy(app) {
    if (!app.buyUrl) return;
    window.triskell.purchase.open(app.buyUrl, app.id);
  }

  // Bloc prix d'une tuile : barre l'ancien prix s'il y a une promo, masque tout
  // si le user possede deja le produit ou que c'est gratuit.
  function renderPriceBlock(app, ownedAlready) {
    if (ownedAlready) return '';
    if (app.tier === 'free') return '';
    if (!app.price) return '';
    const original = app.priceOriginal && app.priceOriginal > app.price
      ? `<span class="price-old">${app.priceOriginal} €</span>` : '';
    const note = app.priceNote
      ? `<span class="price-note">${escapeHtml(app.priceNote)}</span>` : '';
    return `
      <div class="price-block">
        <span class="price-current">${app.price} €</span>
        ${original}
        ${note}
      </div>
    `;
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
    // Si le produit a plusieurs outils (Suite des Heros), on affiche un sous-menu
    // au lieu d'ouvrir le dossier d'install.
    if (Array.isArray(app.tools) && app.tools.length > 0) {
      if (!state.installs[app.id]) {
        showToast({ kind: 'error', title: 'Pas encore installé', message: 'Installe d\'abord ' + app.name });
        return;
      }
      openToolPicker(app);
      return;
    }
    const res = await window.triskell.launch.product(app.id);
    if (!res.ok) {
      showToast({
        kind: 'error',
        title: 'Lancement impossible',
        message: humanizeLaunchError(res),
        timeout: 9000
      });
      return;
    }
    if (window.triskell.prefs) window.triskell.prefs.setLastUsed(app.id).then(r => {
      if (r && r.lastUsed) state.prefs.lastUsed = r.lastUsed;
    });
  }

  function openToolPicker(app) {
    const tools = app.tools.map(t => `
      <button class="tool-pick" data-tool="${t.id}">
        <strong>${escapeHtml(t.name)}</strong>
        <span class="muted small">${escapeHtml(t.tagline)}</span>
      </button>
    `).join('');

    openModal({
      title: `Lancer un outil de ${app.name}`,
      bodyHtml: `<div class="tool-picker">${tools}</div>`,
      ctaLabel: 'Fermer',
      onCta: closeModal
    });

    document.querySelectorAll('.tool-pick').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toolId = btn.dataset.tool;
        closeModal();
        const res = await window.triskell.launch.tool(app.id, toolId);
        if (!res.ok) {
          showToast({
            kind: 'error',
            title: 'Lancement impossible',
            message: humanizeLaunchError(res),
            timeout: 9000
          });
        } else if (window.triskell.prefs) {
          window.triskell.prefs.setLastUsed(app.id).then(r => {
            if (r && r.lastUsed) state.prefs.lastUsed = r.lastUsed;
          });
        }
      });
    });
  }

  async function onUninstall(app) {
    const res = await window.triskell.install.uninstall(app.id);
    closeModal();
    if (res.ok) {
      delete state.installs[app.id];
      render();
      showToast({
        kind: 'success',
        title: `${app.name} désinstallé`,
        message: 'Tu peux le réinstaller à tout moment.'
      });
    } else {
      showToast({
        kind: 'error',
        title: 'Désinstallation échouée',
        message: res.message || 'Erreur inconnue',
        timeout: 9000
      });
    }
  }

  async function onInstall(app) {
    state.installing.add(app.id);
    render();
    showInstallModal(app.name);

    const res = await window.triskell.install.start(app.id);

    state.installing.delete(app.id);
    hideInstallModal();

    if (res.ok) {
      state.installs[app.id] = {
        installPath: res.installPath,
        mainExe: res.mainExe,
        version: res.version
      };
      render();
      showToast({
        kind: 'success',
        title: `${app.name} installé`,
        message: 'Tu peux le lancer maintenant.',
        actionLabel: 'Lancer',
        onAction: () => onLaunch(app)
      });
    } else {
      render();
      showToast({
        kind: 'error',
        title: 'Installation échouée',
        message: humanizeInstallError(res),
        timeout: 9000
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

    let priceHtml = '';
    if (!owned && app.price) {
      const original = app.priceOriginal && app.priceOriginal > app.price
        ? `<span class="price-old">${app.priceOriginal} €</span>` : '';
      priceHtml = `
        <div class="price-block" style="margin-top:14px;">
          <span class="price-current">${app.price} €</span>
          ${original}
          ${app.priceNote ? `<span class="price-note">${escapeHtml(app.priceNote)}</span>` : ''}
        </div>
        ${state.promoNote ? `<p class="muted small" style="margin-top:6px;">🎟️ ${escapeHtml(state.promoNote)}</p>` : ''}
      `;
    }

    const uninstallBtn = installed
      ? `<button class="ghost-btn" id="uninstall-btn" style="margin-top:14px;color:var(--danger);border-color:var(--danger);">Désinstaller</button>`
      : '';

    openModal({
      title: app.name,
      bodyHtml: `
        <p class="muted">${escapeHtml(app.tagline || '')}</p>
        <p class="muted small">Statut : ${owned ? '<strong style="color:var(--green)">possédé</strong>' : 'non acquis'}${installed ? ' · installé' : ''}</p>
        ${priceHtml}
        ${toolsHtml}
        ${uninstallBtn}
      `,
      ctaLabel: 'OK'
    });

    const ub = document.getElementById('uninstall-btn');
    if (ub) ub.addEventListener('click', () => {
      if (confirm(`Vraiment désinstaller ${app.name} ? Le dossier d'installation sera supprimé.`)) {
        onUninstall(app);
      }
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
  // TOASTS (notifications non-bloquantes)
  // ============================================================================
  function showToast({ kind = 'info', title, message, actionLabel, onAction, timeout = 6000 }) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;

    const iconChar = kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i';
    toast.innerHTML = `
      <div class="toast-icon" aria-hidden="true">${iconChar}</div>
      <div class="toast-body">
        ${title ? `<p class="toast-title">${escapeHtml(title)}</p>` : ''}
        ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ''}
      </div>
    `;

    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        onAction();
        dismiss();
      });
      toast.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', dismiss);
    toast.appendChild(closeBtn);

    els.toasts.appendChild(toast);

    let timer = setTimeout(dismiss, timeout);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });

    function dismiss() {
      if (!toast.isConnected) return;
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 200);
    }
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
