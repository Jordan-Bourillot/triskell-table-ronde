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
    prefs: { autoLaunch: false, telemetry: false, lastUsed: [] },
    categories: [],         // [{ id, label, subtitle, default }]
    activeCategory: null    // id de la catégorie sélectionnée (onglet actif)
  };

  const $ = (id) => document.getElementById(id);

  // ID du produit dont la fiche dediee est actuellement affichee (null si on
  // est sur la grille). Permet de re-render la fiche apres un changement
  // d'etat (achat, install, scan auto qui detecte un .exe...).
  state.openProductId = null;

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
    loginResendBtn:$('login-resend-btn'),
    loginSentEmail:$('login-sent-email'),
    loginError:    $('login-error'),
    loginVersion:  $('login-version'),
    // app
    appScreen:    $('app-screen'),
    grid:         $('grid'),
    tabs:         $('main-tabs'),
    empty:        $('empty-state'),
    loading:      $('loading-state'),
    accountBtn:   $('account-btn'),
    accountAvatar: $('account-avatar'),
    accountName:   $('account-name'),
    accountStatus: $('account-status'),
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
    toasts:          $('toasts'),
    // decoration thematique
    emptyDecor:      $('empty-decor'),
    // page produit
    productScreen:    $('product-screen'),
    productBack:      $('product-back'),
    productIcon:      $('product-icon'),
    productTags:      $('product-tags'),
    productName:      $('product-name'),
    productTagline:   $('product-tagline'),
    productStatus:    $('product-status'),
    productPriceBlock:$('product-price-block'),
    productActions:   $('product-actions'),
    productMedia:     $('product-media'),
    productDescription: $('product-description'),
    productFeaturesSection: $('product-features-section'),
    productFeatures:  $('product-features'),
    productToolsSection: $('product-tools-section'),
    productToolsTitle: $('product-tools-title'),
    productTools:     $('product-tools'),
    productLinksSection: $('product-links-section'),
    productLinks:     $('product-links')
  };

  // ============================================================================
  // BOOT
  // ============================================================================
  // Splash : on garde une trace du timestamp pour garantir une duree mini
  // (sinon l'effet flashe sur les machines rapides). 1100ms est un sweet
  // spot : le user voit le branding mais ne s'agace pas d'attendre.
  const splashStartedAt = Date.now();
  const SPLASH_MIN_MS = 1100;
  cycleSplashMessage();

  init()
    .then(() => hideSplash())
    .catch(err => {
      hideSplash();
      showFatalError(err.message);
    });

  async function init() {
    bindModal();
    bindProductPage();
    bindInstallProgress();
    bindUpdateStatus();
    bindPurchaseCompleted();
    bindViewSwitcher();

    // Theme : lit la pref (dark/light/auto) et l'applique sur <html>
    // AVANT le 1er render pour eviter le flash de theme.
    await applyThemeFromPrefs();

    const meta = await window.triskell.getMeta();
    els.loginVersion.textContent = `Triskell Studio · v${meta.version}`;
    els.metaText.textContent = `Triskell Studio · v${meta.version}`;
    const bv = document.getElementById('brand-version');
    if (bv) bv.textContent = `v${meta.version}`;

    const session = await window.triskell.auth.getSession();
    if (session && session.user) {
      state.user = session.user;
      await enterApp();
    } else {
      showLogin();
    }
  }

  // Petite touche : fait defiler 2-3 messages thematiques pendant le splash
  // (texte change toutes les 500ms tant que l'app charge).
  function cycleSplashMessage() {
    const target = document.getElementById('splash-message');
    if (!target) return;
    const messages = [
      'Allumage des chandelles…',
      'Convocation des compagnons…',
      'Polissage des sceaux…'
    ];
    let i = 0;
    setInterval(() => {
      i = (i + 1) % messages.length;
      target.textContent = messages[i];
    }, 600);
  }

  function hideSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const elapsed = Date.now() - splashStartedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(() => {
      splash.classList.add('is-leaving');
      setTimeout(() => splash.classList.add('hidden'), 550); // > transition CSS 0.5s
    }, wait);
  }

  // ============================================================================
  // THEME (dark / light / auto)
  // ============================================================================
  // Defaut SOMBRE. L'utilisateur peut basculer en clair ou auto via le toggle
  // dans la modale Compte (section Apparence).
  async function applyThemeFromPrefs() {
    let theme = 'dark';
    try {
      const prefs = window.triskell.prefs ? await window.triskell.prefs.get() : {};
      if (prefs && ['dark', 'light', 'auto'].includes(prefs.theme)) {
        theme = prefs.theme;
      }
    } catch (_) { /* dev */ }
    setTheme(theme, /*persist*/ false);
  }

  function setTheme(theme, persist = true) {
    const t = ['dark', 'light', 'auto'].includes(theme) ? theme : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    state.prefs = state.prefs || {};
    state.prefs.theme = t;
    if (persist && window.triskell.prefs && window.triskell.prefs.setTheme) {
      window.triskell.prefs.setTheme(t).catch(() => {});
    }
  }

  // Quand l'OS bascule (sombre/clair) et qu'on est en 'auto', le CSS
  // gere deja via @media (prefers-color-scheme). Rien a faire en JS.

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
      // Animation "triumph" : 1.2s de rotation + scale + halo dore avant
      // de basculer sur l'app, pour marquer le moment "Bienvenue a la Table".
      const logo = document.querySelector('.login-logo');
      if (logo) logo.classList.add('triumph');
      await new Promise(r => setTimeout(r, 900));
      hideLogin();
      enterApp();
    });

    els.loginBackBtn.addEventListener('click', () => {
      els.loginCode.value = '';
      showLoginEmailStep();
    });

    if (els.loginResendBtn) {
      els.loginResendBtn.addEventListener('click', async () => {
        const email = els.loginSentEmail.textContent;
        if (!email) return;

        els.loginResendBtn.disabled = true;
        const original = els.loginResendBtn.textContent;
        els.loginResendBtn.textContent = 'Envoi...';
        clearLoginError();

        const res = await window.triskell.auth.login(email);

        if (!res.ok) {
          setLoginError(humanizeAuthError(res.error)
            + (res.message ? ` (${res.message})` : ''));
          els.loginResendBtn.disabled = false;
          els.loginResendBtn.textContent = original;
          return;
        }

        // Succès — petit cooldown 30s pour éviter le spam.
        els.loginResendBtn.textContent = 'Code renvoyé ✓';
        let cooldown = 30;
        const tick = setInterval(() => {
          cooldown -= 1;
          if (cooldown <= 0) {
            clearInterval(tick);
            els.loginResendBtn.disabled = false;
            els.loginResendBtn.textContent = original;
          } else {
            els.loginResendBtn.textContent = `Renvoyer (${cooldown}s)`;
          }
        }, 1000);
      });
    }
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
    // Splash immersif des l'entree : logo + titre + barre de chargement.
    // Le picker d'univers viendra remplacer la barre une fois le min time
    // ecoule (cf awaitUniverseChoice).
    showImmersiveSplash();
    const splashStartedAt = Date.now();

    const cat = await window.triskell.getApps();
    if (cat.error) {
      showFatalError('Catalogue introuvable : ' + cat.error);
      return;
    }
    state.apps = cat.apps || [];
    state.bundles = cat.bundles || [];
    state.completionBundle = cat.completionBundle || null;
    state.promoNote = cat.promoNote || '';
    state.announcement = cat.announcement || null;
    state.categories = Array.isArray(cat.categories) ? cat.categories : [];
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
    state.prefs = { autoLaunch: false, telemetry: false, lastUsed: [], viewMode: 'hero', ...prefs };
    if (!['hero', 'compact', 'discover'].includes(state.prefs.viewMode)) {
      state.prefs.viewMode = 'hero';
    }
    state.versions = { ...state.versions, ...(versions || {}) };

    // Catégorie active : priorité au lastCategory persistant (l'utilisateur
    // retrouve l'onglet où il était), sinon la première marquée default,
    // sinon la première de la liste.
    if (state.categories.length > 0) {
      const valid = (id) => state.categories.some(c => c.id === id);
      const last = valid(state.prefs.lastCategory) ? state.prefs.lastCategory : null;
      const def = state.categories.find(c => c.default) || state.categories[0];
      state.activeCategory = last || def.id;
    }

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

    renderAccountPill();

    bindHeader();
    render();
    // On laisse la barre de chargement finir visuellement (min 3s depuis
    // le debut du splash), puis on bascule sur le picker d'univers dans le
    // meme overlay. Le scan auto continue en background pendant ce temps.
    const elapsed = Date.now() - splashStartedAt;
    const minSplashMs = 3000;
    setTimeout(awaitUniverseChoice, Math.max(0, minSplashMs - elapsed));

    // Scan auto en arriere-plan : detecte les .exe installes ailleurs
    // (par ex. Suite des Heros installee via productivite.triskell-studio.fr
    // avant que le Lanceur n'existe). Si on trouve quelque chose, on
    // refresh l'etat et on previent l'utilisateur via toast.
    if (window.triskell.installs.scan) {
      const productIds = state.apps.map(a => a.id);
      window.triskell.installs.scan(productIds).then(res => {
        if (res && res.ok && Array.isArray(res.detected) && res.detected.length) {
          // Recupere la liste a jour des installs et re-render
          window.triskell.installs.list().then(updated => {
            state.installs = updated || state.installs;
            render();
            const names = res.detected
              .map(d => (state.apps.find(a => a.id === d.productId) || {}).name || d.productId)
              .join(', ');
            showToast({
              kind: 'success',
              title: `${res.detected.length} outil${res.detected.length > 1 ? 's' : ''} déjà installé${res.detected.length > 1 ? 's' : ''} détecté${res.detected.length > 1 ? 's' : ''}`,
              message: `${names} — reconnu${res.detected.length > 1 ? 's' : ''} sur ta machine, tu peux le${res.detected.length > 1 ? 's' : ''} lancer directement.`,
              timeout: 8000
            });
          });
        }
      }).catch(() => { /* scan optionnel, on ignore les erreurs */ });
    }

    // "Quoi de neuf" : si on detecte un changement de version (auto-update qui
    // vient d'aboutir ou MAJ via reinstall), on affiche les release notes
    // GitHub avec un petit delai pour ne pas masquer le rendu de la grille.
    setTimeout(() => maybeShowChangelog(), 800);
  }

  // Affiche une bulle "Quoi de neuf" si la version installee differe de la
  // derniere vue. Source : release notes GitHub (prefer markdown sobre).
  // Premiere installation = on enregistre la version sans rien afficher.
  async function maybeShowChangelog() {
    if (!window.triskell.changelog) return;
    const meta = await window.triskell.getMeta();
    const current = meta.version;
    const lastSeen = state.prefs.lastSeenVersion || '';

    // Premiere fois qu'on voit ce user / cette version stockee — on enregistre
    // sans afficher (pas de release notes a "rattraper", on demarre frais).
    if (!lastSeen) {
      window.triskell.prefs.setLastSeenVersion(current).catch(() => {});
      return;
    }
    // Deja vu cette version
    if (lastSeen === current) return;

    const r = await window.triskell.changelog.fetch(current);
    // Marque vu meme si on n'a pas pu recuperer les notes — pas de spam au
    // prochain demarrage.
    window.triskell.prefs.setLastSeenVersion(current).catch(() => {});
    if (!r || !r.ok || !r.body) return;

    showChangelogModal({
      version: current,
      title: r.name || `v${current}`,
      body: r.body,
      previousVersion: lastSeen
    });
  }

  function showChangelogModal({ version, title, body, previousVersion }) {
    // Mise en forme markdown -> HTML simple : titres "##", listes "-", "*"
    // et **gras** sont reconnus. Le reste passe en paragraphes.
    const html = renderChangelogBody(body);
    openModal({
      title: `Quoi de neuf · ${title}`,
      bodyHtml: `
        <p class="muted small" style="margin-bottom:14px;">
          Tu es passé de <strong style="color:var(--text);">v${escapeHtml(previousVersion)}</strong>
          à <strong style="color:var(--accent);">v${escapeHtml(version)}</strong>.
          Voici ce qui change.
        </p>
        <div class="changelog-body">${html}</div>
      `,
      ctaLabel: 'Compris',
      onCta: closeModal
    });
  }

  function renderChangelogBody(md) {
    if (!md) return '';
    const lines = String(md).split(/\r?\n/);
    const out = [];
    let inList = false;
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); continue; }
      // Titre h2
      if (/^##\s+/.test(line)) {
        closeList();
        out.push(`<h3 class="changelog-h">${escapeInlineMd(line.replace(/^##\s+/, ''))}</h3>`);
        continue;
      }
      // Bullet
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul class="changelog-list">'); inList = true; }
        out.push(`<li>${escapeInlineMd(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
        continue;
      }
      // Paragraphe
      closeList();
      out.push(`<p class="changelog-p">${escapeInlineMd(line)}</p>`);
    }
    closeList();
    return out.join('\n');
  }

  // Echappe le HTML puis re-active **gras** et `code` minimaliste.
  function escapeInlineMd(s) {
    let out = escapeHtml(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    return out;
  }

  // ============================================================================
  // SPLASH IMMERSIF : entree dans l'univers Triskell
  // ============================================================================
  // Etape 1 (showImmersiveSplash) : logo Triskell + titre Cinzel + barre de
  // chargement qui se remplit. Affiche TOUT DE SUITE des l'entree dans
  // enterApp, avant meme que les donnees soient chargees.
  // Etape 2 (awaitUniverseChoice) : la barre disparait, les 2 cartes
  // d'univers (Quotidien / Pro) prennent le relais avec une transition
  // fade in. L'overlay reste plein ecran tout le long.
  let splashRevealed = false;

  function showImmersiveSplash() {
    const host = els.loading;
    if (!host) return;
    host.classList.add('is-splash');
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="splash-logo-wrap">
        <img class="splash-logo" src="assets/triskell_mark_taskbar.png" alt="Triskell"
             onerror="this.style.display='none';" />
      </div>
      <div class="splash-content">
        <h1 class="splash-title">La Table Ronde</h1>
        <p class="splash-sub">Le lieu où tes outils Triskell se réunissent</p>
        <div class="splash-stage" id="immersive-splash-stage">
          <div class="splash-loading">
            <div class="splash-progress" aria-label="Chargement">
              <div class="splash-progress-bar" id="splash-progress-bar"></div>
            </div>
            <p class="splash-status" id="splash-status">Convocation de tes compagnons...</p>
          </div>
        </div>
      </div>
    `;
    // Lance l'animation de remplissage de la barre (CSS transition)
    requestAnimationFrame(() => {
      const bar = document.getElementById('splash-progress-bar');
      if (bar) bar.style.width = '100%';
    });
  }

  function awaitUniverseChoice() {
    if (splashRevealed) return;
    const host = els.loading;
    if (!host) return;

    const cats = state.categories || [];
    if (cats.length < 2) {
      splashRevealed = true;
      host.classList.add('hidden');
      host.classList.remove('is-splash');
      return;
    }

    // Transition : on remplace UNIQUEMENT le contenu du stage (barre +
    // statut) par les cartes, en gardant le logo + titre du splash. Effet
    // "fade out -> fade in" pour rester immersif.
    // Bug fix 2026-05-04 : le boot splash (HTML) utilisait aussi
    // id="splash-stage", donc getElementById renvoyait le boot deja cache
    // et l'innerHTML etait remplace au mauvais endroit. On utilise un id
    // dedie cote splash immersif et on query depuis le host.
    const stage = host.querySelector('#immersive-splash-stage') || host.querySelector('.splash-stage');
    if (!stage) {
      // Fallback si le stage n'existe pas (cas edge)
      splashRevealed = true;
      host.classList.add('hidden');
      host.classList.remove('is-splash');
      return;
    }

    // Numerotation romaine de chaque chapitre (I, II, ...) — petit detail
     // manuscrit qui ancre l'idee de "tomes" plutot que d'onglets banals.
    const toRoman = (n) => {
      const map = [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
      let out = '', x = n;
      for (const [g, v] of map) { while (x >= v) { out += g; x -= v; } }
      return out;
    };

    stage.classList.add('is-leaving');
    setTimeout(() => {
      stage.innerHTML = `
        <div class="splash-picker">
          <p class="splash-picker-prompt">Quelle table veux-tu rejoindre ?</p>
          <div class="splash-picker-cards">
            ${cats.map((c, i) => {
              const chapter = toRoman(i + 1);
              // Texte court qui décrit l'univers du chapitre. Défini sur la
              // catégorie dans apps.json (champ "description"). Ancien
              // "subtitle" gardé en fallback pour rétro-compatibilité.
              const desc = c.description || c.subtitle || '';
              return `
              <button type="button" class="splash-card" data-universe="${escapeHtml(c.id)}">
                <span class="splash-card-aura" aria-hidden="true"></span>
                <span class="splash-card-numeral" aria-hidden="true">${chapter}</span>
                <span class="splash-card-eyebrow">Chapitre ${chapter}</span>
                <span class="splash-card-label">${escapeHtml(c.label)}</span>
                <span class="splash-card-rule" aria-hidden="true">
                  <span class="splash-card-rule-line"></span>
                  <span class="splash-card-rule-glyph">&#9670;</span>
                  <span class="splash-card-rule-line"></span>
                </span>
                <span class="splash-card-desc">${escapeHtml(desc)}</span>
                <span class="splash-card-cta">
                  <span class="splash-card-cta-text">Entrer</span>
                  <span class="splash-card-cta-arrow" aria-hidden="true">&rarr;</span>
                </span>
              </button>
            `;}).join('')}
          </div>
        </div>
      `;
      stage.classList.remove('is-leaving');
      stage.classList.add('is-entering');

      stage.querySelectorAll('.splash-card').forEach(btn => {
        btn.addEventListener('click', () => {
          if (splashRevealed) return;
          splashRevealed = true;
          const id = btn.dataset.universe;
          if (id) setActiveCategory(id);

          // Animation "ouverture du livre" via View Transitions API :
          // - état AVANT : la carte cliquée porte view-transition-name=portal
          // - état APRÈS : c'est la grille qui porte le même nom
          // → l'API morphe le rectangle de la carte vers celui de la grille.
          // Effet : on a l'impression que la carte se déploie pour devenir
          // l'écran principal. Fallback fade-out simple si l'API manque.
          btn.style.viewTransitionName = 'chapter-portal';
          const apply = () => {
            host.classList.add('hidden');
            host.classList.remove('is-splash');
            btn.style.viewTransitionName = '';
            render();
            const grid = document.getElementById('grid');
            if (grid) {
              grid.style.viewTransitionName = 'chapter-portal';
              // Retire le name après l'animation pour ne pas piéger les
              // futures view-transitions (dismiss d'annonce, etc.).
              setTimeout(() => { grid.style.viewTransitionName = ''; }, 800);
            }
          };
          if (typeof document.startViewTransition === 'function') {
            document.startViewTransition(apply);
          } else {
            host.classList.add('is-leaving');
            setTimeout(() => { apply(); host.classList.remove('is-leaving'); }, 280);
          }
        });
      });
    }, 240);
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

  // Calcule les badges debloques d'apres les stats. Renvoie une liste
  // d'objets { emoji, label, hint, unlocked }.
  function computeBadges(stats) {
    const totalLaunches = Object.values(stats || {}).reduce((s, e) => s + (e.count || 0), 0);
    const productsLaunched = Object.keys(stats || {}).filter(k => (stats[k].count || 0) > 0).length;
    const maxToolCount = Math.max(0, ...Object.values(stats || {}).flatMap(e =>
      Object.values(e.tools || {})
    ));
    const ownedCount = Object.keys(state.licenses).length;
    return [
      { emoji: '🌱', label: 'Premier pas',     hint: '1er lancement enregistré',          unlocked: totalLaunches >= 1 },
      { emoji: '⚔️', label: 'Compagnon',       hint: '10 lancements au total',            unlocked: totalLaunches >= 10 },
      { emoji: '🛡️', label: 'Veilleur',        hint: '50 lancements au total',            unlocked: totalLaunches >= 50 },
      { emoji: '👑', label: 'Maître Trieur',   hint: '50 fois sur un même outil',         unlocked: maxToolCount >= 50 },
      { emoji: '🏛️', label: 'Table Ronde',     hint: 'Tous tes outils possédés ouverts',  unlocked: ownedCount > 0 && productsLaunched >= ownedCount },
    ];
  }

  async function openAccountMenu() {
    const updateLine = state.updateInfo
      ? `<p class="muted small" id="update-line">${escapeHtml(state.updateInfo)}</p>`
      : `<p class="muted small" id="update-line"></p>`;

    const autoLaunch = !!state.prefs.autoLaunch;
    const telemetry = !!state.prefs.telemetry;

    const displayName = state.prefs.displayName || '';
    const version = (document.getElementById('brand-version')?.textContent || '').trim();

    // Stats : on les recupere si dispo
    const stats = (window.triskell.stats && await window.triskell.stats.get()) || {};
    const totalLaunches = Object.values(stats).reduce((s, e) => s + (e.count || 0), 0);
    const badges = computeBadges(stats);
    const unlockedBadges = badges.filter(b => b.unlocked);
    const lockedBadges = badges.filter(b => !b.unlocked);

    const statsHtml = totalLaunches > 0 ? `
      <div class="account-section stats-section">
        <p class="account-section-title">Tes hauts faits</p>
        <p class="muted small" style="margin:0 0 10px;">${totalLaunches} lancement${totalLaunches > 1 ? 's' : ''} au compteur · ${unlockedBadges.length}/${badges.length} badges débloqués</p>
        <div class="badges-grid">
          ${badges.map(b => `
            <div class="badge ${b.unlocked ? 'badge-unlocked' : 'badge-locked'}" title="${escapeHtml(b.hint)}">
              <span class="badge-emoji">${b.emoji}</span>
              <span class="badge-label">${escapeHtml(b.label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    openModal({
      title: '',
      bodyHtml: `
        <div style="display:flex;align-items:center;gap:14px;margin:4px 0 20px;">
          <img src="assets/triskell_mark.png" alt="Triskell" style="width:52px;height:52px;border-radius:12px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <h2 style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:0.3px;">Mon compte Triskell</h2>
            <p class="muted small" style="margin:2px 0 0;">Table Ronde ${escapeHtml(version)}</p>
          </div>
        </div>
        <p style="text-align:center;color:var(--text);margin:0 0 6px;">Connecté avec <strong style="color:var(--triskell-violet);">${escapeHtml(state.user.email)}</strong></p>
        <p class="muted" style="text-align:center;">Tu possèdes <strong style="color:var(--text);">${Object.keys(state.licenses).length}</strong> licence${Object.keys(state.licenses).length > 1 ? 's' : ''}.</p>

        ${statsHtml}

        <div class="avatar-section">
          <div class="avatar-large" id="profile-avatar-preview">${
            state.prefs.avatar
              ? `<img src="${escapeHtml(state.prefs.avatar)}" alt="">`
              : escapeHtml(accountInitials())
          }</div>
          <div style="flex:1;min-width:0;">
            <p style="margin:0 0 6px;font-weight:600;color:var(--text);font-size:13px;">Photo de profil</p>
            <p class="muted small" style="margin:0 0 10px;">PNG, JPG ou WebP. Auto-redimensionné à 256 × 256.</p>
            <div class="avatar-actions">
              <button class="ghost-btn" id="avatar-upload-btn" type="button">Choisir une image…</button>
              ${state.prefs.avatar
                ? `<button class="ghost-btn" id="avatar-remove-btn" type="button">Retirer</button>`
                : ''}
            </div>
            <input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/webp" style="display:none" />
          </div>
        </div>

        <div class="account-section profile-section">
          <label class="profile-field">
            <span class="profile-label">Comment veux-tu que je t'appelle ?</span>
            <input type="text" id="pref-display-name" class="profile-input"
                   maxlength="40" placeholder="Jordan, Maître Trieur, Compagnon…"
                   value="${escapeHtml(displayName)}" />
            <span class="profile-saved muted small hidden" id="pref-display-name-saved">Enregistré ✓</span>
          </label>
          <p class="muted small profile-hint">Apparaîtra dans le bandeau et le pill compte. Laisse vide pour rester anonyme.</p>
        </div>

        <div class="account-section">
          <label class="pref-row">
            <span><strong>Lancer au démarrage de Windows</strong><br><span class="muted small">Triskell s'ouvre automatiquement quand tu allumes ton PC.</span></span>
            <input type="checkbox" id="pref-auto-launch" ${autoLaunch ? 'checked' : ''}>
          </label>
          <label class="pref-row">
            <span><strong>Statistiques anonymes</strong><br><span class="muted small">Aide Triskell à savoir ce qui est utilisé. Aucune donnée perso, aucun tracker.</span></span>
            <input type="checkbox" id="pref-telemetry" ${telemetry ? 'checked' : ''}>
          </label>
          <div class="pref-row pref-row-stack">
            <span><strong>Apparence</strong><br><span class="muted small">Choisis ton thème — "Auto" suit ton système.</span></span>
            <div class="theme-toggle" role="group" aria-label="Thème">
              <button type="button" class="theme-toggle-btn ${state.prefs.theme === 'auto' ? 'active' : ''}" data-theme="auto">🖥 Auto</button>
              <button type="button" class="theme-toggle-btn ${state.prefs.theme === 'light' ? 'active' : ''}" data-theme="light">☀ Clair</button>
              <button type="button" class="theme-toggle-btn ${(state.prefs.theme || 'dark') === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Sombre</button>
            </div>
          </div>
        </div>

        <div class="account-section">
          <button class="ghost-btn" id="check-updates-btn" type="button">Vérifier les mises à jour</button>
          ${updateLine}
        </div>

        <div class="account-section">
          <button class="ghost-btn account-link-btn" id="invoices-btn" type="button">
            <span>Mes factures</span>
            <span class="muted small">→ ${escapeHtml(state.user.email)}</span>
          </button>
          <p class="muted small" style="margin:6px 0 0;">Demande tes factures par email — réponse sous 24 h ouvrées.</p>
        </div>

        <div class="account-section">
          <button class="ghost-btn account-link-btn" id="report-bug-btn" type="button">
            <span>🐞 Signaler un bug</span>
            <span class="muted small">→ contact@triskell-studio.fr</span>
          </button>
          <p class="muted small" style="margin:6px 0 0;">Décris ce qui ne va pas, ton mail s'ouvrira pré-rempli (version, OS, email).</p>
        </div>

        <div class="account-section danger-zone">
          <details>
            <summary class="danger-summary">Zone sensible</summary>
            <p class="muted small" style="margin:8px 0 6px;">Supprimer ton compte efface ton email, ton historique de licences, et te déconnecte de tous tes appareils. Tes paiements Stripe restent conservés (obligation légale), mais Triskell ne peut plus relier l'historique à toi.</p>
            <button class="ghost-btn danger-btn" id="delete-account-btn" type="button">Supprimer mon compte Triskell</button>
          </details>
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

    // Theme toggle (Auto / Clair / Sombre)
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme');
        setTheme(theme, /*persist*/ true);
        // Met a jour visuellement les 3 boutons
        document.querySelectorAll('.theme-toggle-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-theme') === theme);
        });
      });
    });

    // Bouton "Mes factures" : tente d'ouvrir le Stripe Customer Portal,
    // fallback mailto si l'utilisateur n'a pas encore de Stripe customer
    // (jamais paye) ou si le portal n'est pas configure cote Stripe.
    const invBtn = document.getElementById('invoices-btn');
    if (invBtn) invBtn.addEventListener('click', async () => {
      invBtn.disabled = true;
      const original = invBtn.innerHTML;
      invBtn.innerHTML = '<span>Ouverture du portail...</span>';
      const r = window.triskell.billing
        ? await window.triskell.billing.openPortal()
        : { ok: false, error: 'no-billing-handler' };
      invBtn.disabled = false;
      invBtn.innerHTML = original;
      if (r && r.ok) {
        // Le portail s'est ouvert dans le navigateur, on ferme la modale
        closeModal();
        return;
      }
      // Fallback : ouvrir un mailto pre-rempli (cas user sans Stripe customer)
      const subject = encodeURIComponent('Demande de factures Triskell');
      const body = encodeURIComponent(
        `Bonjour,\n\nMerci de bien vouloir m'envoyer mes factures pour les achats effectues avec l'email ${state.user.email}.\n\nMerci !\n`
      );
      window.triskell.openExternal(`mailto:contact@triskell-studio.fr?subject=${subject}&body=${body}`);
    });

    // Bouton "Signaler un bug" : mailto pre-rempli avec contexte technique
    const bugBtn = document.getElementById('report-bug-btn');
    if (bugBtn) bugBtn.addEventListener('click', () => {
      const ver = (document.getElementById('brand-version')?.textContent || '').trim();
      const subject = encodeURIComponent(`[Bug Lanceur ${ver}] `);
      const body = encodeURIComponent(
        `Bonjour,\n\n` +
        `J'ai rencontre un probleme avec le Lanceur Triskell.\n\n` +
        `Description du probleme :\n[Decris ici ce qui ne va pas]\n\n` +
        `Ce que je faisais :\n[Decris ici ce que tu essayais de faire]\n\n` +
        `Ce qui devrait se passer :\n[Decris ici ce que tu attendais]\n\n` +
        `--- Infos techniques (ne pas effacer) ---\n` +
        `Lanceur : ${ver}\n` +
        `Email compte : ${state.user.email}\n` +
        `Plateforme : ${navigator.platform}\n` +
        `User Agent : ${navigator.userAgent}\n`
      );
      window.triskell.openExternal(`mailto:contact@triskell-studio.fr?subject=${subject}&body=${body}`);
    });

    // Bouton "Supprimer mon compte" : double confirmation par mot-typage.
    const delBtn = document.getElementById('delete-account-btn');
    if (delBtn) delBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        `Supprimer définitivement le compte ${state.user.email} ?\n\n` +
        `Cette action est IRREVERSIBLE. Tu perdras l'accès à tes licences ` +
        `via le Lanceur (les paiements Stripe restent valides côté Stripe).`
      );
      if (!confirmed) return;
      delBtn.disabled = true;
      delBtn.textContent = 'Suppression en cours...';
      const res = await window.triskell.auth.deleteAccount(state.user.email);
      if (!res.ok) {
        delBtn.disabled = false;
        delBtn.textContent = 'Supprimer mon compte Triskell';
        showToast({
          kind: 'error',
          title: 'Suppression échouée',
          message: res.error === 'email-mismatch'
            ? 'Ton email ne correspond pas à la session.'
            : (res.message || 'Erreur serveur, réessaie.'),
          timeout: 9000
        });
        return;
      }
      // Compte supprime — on revient au login et on affiche un toast de fin.
      state.user = null;
      state.licenses = {};
      state.installs = {};
      closeModal();
      showLogin();
      showToast({
        kind: 'success',
        title: 'Compte supprimé',
        message: 'Tes données Triskell ont été effacées. À bientôt si tu reviens.',
        timeout: 12000
      });
    });

    // Champ "prenom" : sauvegarde debounce + petit feedback "Enregistre".
    const dn = document.getElementById('pref-display-name');
    const dnSaved = document.getElementById('pref-display-name-saved');
    const dnPreview = document.getElementById('profile-preview');
    if (dn) {
      let dnTimer = null;
      dn.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (dnPreview) dnPreview.textContent = val || 'Compagnon';
        clearTimeout(dnTimer);
        dnTimer = setTimeout(async () => {
          const r = await window.triskell.prefs.setDisplayName(val);
          if (r && r.ok) {
            state.prefs.displayName = r.displayName;
            if (dnSaved) {
              dnSaved.classList.remove('hidden');
              setTimeout(() => dnSaved.classList.add('hidden'), 1800);
            }
            // Repeint le bandeau + le pill compte (nom maj live partout)
            renderHomeBanner();
            renderAccountPill();
          }
        }, 500);
      });
    }

    // ===== Avatar : upload + retrait =====
    const avatarBtn   = document.getElementById('avatar-upload-btn');
    const avatarInput = document.getElementById('avatar-file-input');
    const avatarRem   = document.getElementById('avatar-remove-btn');
    const avatarPrev  = document.getElementById('profile-avatar-preview');

    if (avatarBtn && avatarInput) {
      avatarBtn.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
          showToast({
            kind: 'error',
            title: 'Format non supporté',
            message: 'PNG, JPEG ou WebP uniquement.',
            timeout: 6000
          });
          return;
        }
        try {
          const dataUrl = await resizeImageToDataUrl(file, 256, 0.85);
          const r = await window.triskell.prefs.setAvatar(dataUrl);
          if (!r || !r.ok) {
            showToast({
              kind: 'error',
              title: 'Upload impossible',
              message: r?.message || 'Réessaie avec une image plus petite.',
              timeout: 7000
            });
            return;
          }
          state.prefs.avatar = r.avatar;
          // Live update : preview dans la modale + pill du header
          if (avatarPrev) {
            avatarPrev.innerHTML = `<img src="${r.avatar}" alt="">`;
          }
          renderAccountPill();
          // Re-render le ribbon "Retirer" si pas encore présent
          if (!avatarRem) {
            const actions = document.querySelector('.avatar-actions');
            if (actions) {
              const btn = document.createElement('button');
              btn.className = 'ghost-btn';
              btn.id = 'avatar-remove-btn';
              btn.type = 'button';
              btn.textContent = 'Retirer';
              btn.addEventListener('click', removeAvatarHandler);
              actions.appendChild(btn);
            }
          }
        } catch (err) {
          showToast({
            kind: 'error',
            title: 'Image illisible',
            message: err.message || 'Impossible de lire ce fichier.',
            timeout: 6000
          });
        }
      });
    }

    async function removeAvatarHandler() {
      const r = await window.triskell.prefs.setAvatar('');
      if (r && r.ok) {
        state.prefs.avatar = '';
        if (avatarPrev) avatarPrev.innerHTML = escapeHtml(accountInitials());
        renderAccountPill();
        const btn = document.getElementById('avatar-remove-btn');
        if (btn) btn.remove();
      }
    }
    if (avatarRem) avatarRem.addEventListener('click', removeAvatarHandler);
  }

  // Resize une image en dataURL via canvas. Garde le ratio, max 'size'×'size',
  // qualite 'quality' (jpeg). Renvoie 'data:image/jpeg;base64,...'.
  function resizeImageToDataUrl(file, size, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Décodage de l\'image échoué'));
        img.onload = () => {
          const ratio = Math.min(size / img.width, size / img.height, 1);
          const w = Math.round(img.width  * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0f1218';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Selecteur de vue (Vedette / Compacte / Découverte). Click -> change
  // state.prefs.viewMode + persiste + re-render. La classe .is-active sur
  // le bouton correspondant est maintenue via syncViewSwitcher().
  function bindViewSwitcher() {
    document.querySelectorAll('.view-switch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.view;
        if (!mode || mode === state.prefs.viewMode) return;
        state.prefs.viewMode = mode;
        syncViewSwitcher();
        render();
        if (window.triskell.prefs && window.triskell.prefs.setViewMode) {
          window.triskell.prefs.setViewMode(mode).catch(err =>
            console.error('setViewMode failed', err));
        }
      });
    });
    syncViewSwitcher();
  }

  function syncViewSwitcher() {
    const current = state.prefs?.viewMode || 'hero';
    document.querySelectorAll('.view-switch').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === current);
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
        message: 'Ta licence est en cours d\'activation...',
        sound: true
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
            message: 'Tu peux installer ton produit maintenant.',
            sound: true
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
  // Choisit dynamiquement quelle app sera mise en HERO (grande card 2x2).
  // Logique hybride :
  //  1) Si DéliNote n'est pas possédée -> DéliNote (priorité commerciale fixe)
  //  2) Sinon, si l'app marquee `featured: true` dans apps.json n'est pas
  //     possedee -> on la pousse
  //  3) Sinon (l'user a tout ce qui est commercial pousse) -> l'app la plus
  //     recemment convoquee prend la vedette
  //  4) Fallback : la commercial featured de apps.json meme possedee, ou la
  //     1ere app premium trouvee.
  // Le label du ruban en coin s'adapte au contexte de selection.
  function pickHero() {
    const owned = (id) => !!state.licenses[id]
                      || (state.apps.find(a => a.id === id)?.tier === 'free');

    // On limite la sélection à la catégorie active : sur l'onglet Pro, le
    // hero doit être un produit Pro (pas DéliNote qui est Quotidien). Sinon
    // les modes Vedette et Compacte rendent le même layout dans Pro.
    const cat = state.activeCategory;
    const inCat = (a) => !cat || (a.category || '') === cat;
    const catApps = state.apps.filter(inCat);

    // 1) Priorité commerciale : DéliNote pour Quotidien (s'il manque),
    //    sinon le 1er produit "premium installable" non-possédé de la
    //    catégorie pour donner un point d'ancrage.
    const delinote = catApps.find(a => a.id === 'delinote');
    if (delinote && !owned('delinote')) {
      return { id: 'delinote', label: 'À découvrir', reason: 'commercial-priority' };
    }

    // 2) App "featured: true" dans apps.json (catégorie active) si non possédée
    const commercial = catApps.find(a => a.featured);
    if (commercial && !owned(commercial.id)) {
      return { id: commercial.id, label: commercial.featuredLabel || 'Populaire', reason: 'commercial' };
    }

    // 3) Plus récemment utilisée (premium uniquement, dans la catégorie)
    const lastUsed = (state.prefs.lastUsed || [])
      .map(id => catApps.find(a => a.id === id))
      .filter(a => a && a.tier === 'premium' && !a.comingSoon);
    if (lastUsed[0]) {
      return { id: lastUsed[0].id, label: 'Tu y reviens souvent', reason: 'usage' };
    }

    // 4) Fallback dans la catégorie : un service avec une offre, sinon
    //    n'importe quel premium non possédé (Le Dénicheur en Pro), sinon
    //    le 1er premium tout court.
    if (commercial) {
      return { id: commercial.id, label: commercial.featuredLabel || 'Populaire', reason: 'fallback-commercial' };
    }
    const service = catApps.find(a => (a.kind === 'service' || a.tier === 'service') && !a.comingSoon);
    if (service) {
      return { id: service.id, label: 'À découvrir', reason: 'fallback-service' };
    }
    const firstPremium = catApps.find(a => a.tier === 'premium' && !a.comingSoon && !owned(a.id));
    if (firstPremium) {
      return { id: firstPremium.id, label: 'À découvrir', reason: 'fallback-first-unowned' };
    }
    const anyPremium = catApps.find(a => a.tier === 'premium' && !a.comingSoon);
    return anyPremium
      ? { id: anyPremium.id, label: 'Populaire', reason: 'fallback-first' }
      : null;
  }

  function render() {
    renderTabs();

    // Marque l'univers actif sur le conteneur principal pour basculer
    // l'ambiance visuelle (Quotidien = lumiere doree chaude, Pro = lueur
    // indigo froide). Le CSS targe .main[data-active-category="pro"] pour
    // override les accents (tiles, hover, fond, sous-titre tabs).
    const mainEl = document.querySelector('.main');
    if (mainEl) {
      if (state.activeCategory) mainEl.dataset.activeCategory = state.activeCategory;
      else delete mainEl.dataset.activeCategory;
    }

    const apps = filteredApps();
    state.hero = pickHero();

    renderHomeBanner();
    renderOfflineBadge();
    renderBundles();
    // Resync après que bundles soient peints : si la catégorie active n'a pas
    // de bundle (ex. onglet Pro), on doit revenir en mode normal.
    syncHomeRowLayout();

    els.grid.innerHTML = '';
    if (apps.length === 0) {
      els.empty.classList.remove('hidden');
      if (els.emptyDecor) els.emptyDecor.classList.add('hidden');
      return;
    }
    els.empty.classList.add('hidden');
    if (els.emptyDecor) els.emptyDecor.classList.remove('hidden');

    // Applique le mode de vue choisi par l'utilisateur (Vedette / Compacte /
    // Découverte). La classe sur .grid pilote le layout CSS.
    const mode = state.prefs?.viewMode || 'hero';
    els.grid.classList.remove('grid-mode-hero', 'grid-mode-compact', 'grid-mode-discover');
    els.grid.classList.add(`grid-mode-${mode}`);

    if (mode === 'discover') {
      renderDiscoverView(apps);
      return;
    }

    const frag = document.createDocumentFragment();

    // Dans l'Atelier des Pros (sauf mode Découverte), on segmente en sections
    // selon le champ `proSection` (generaliste / batiment / ...). Les apps
    // sans `proSection` tombent dans 'generaliste' par défaut. L'ordre des
    // sections est figé ci-dessous — les sections inconnues apparaissent
    // après, dans l'ordre où elles arrivent.
    if (state.activeCategory === 'pro' && mode !== 'discover') {
      const PRO_SECTIONS = [
        { key: 'generaliste', label: 'Digital tous métiers' },
        { key: 'batiment',    label: 'Spécial Bâtiment' }
      ];
      const grouped = new Map();
      for (const app of apps) {
        const section = app.proSection || 'generaliste';
        if (!grouped.has(section)) grouped.set(section, []);
        grouped.get(section).push(app);
      }

      // Mini-nav chips au-dessus de la grille : signal que plusieurs sections
      // existent + lien direct (smooth scroll) vers chacune. Évite que les
      // sections du bas (Bâtiment) soient invisibles pour qui ne scroll pas.
      const sectionsToRender = [];
      for (const { key, label } of PRO_SECTIONS) {
        if (grouped.has(key) && grouped.get(key).length > 0) {
          sectionsToRender.push({ key, label, apps: grouped.get(key) });
          grouped.delete(key);
        }
      }
      for (const [key, sectionApps] of grouped) {
        sectionsToRender.push({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          apps: sectionApps
        });
      }
      if (sectionsToRender.length > 1) {
        const nav = document.createElement('div');
        nav.className = 'pro-section-nav';
        nav.innerHTML = sectionsToRender.map(({ key, label, apps: secApps }) => `
          <button class="pro-nav-chip" data-section="${key}" type="button">
            <span class="pro-nav-chip-label">${escapeHtml(label)}</span>
            <span class="pro-nav-chip-count">${secApps.length}</span>
          </button>
        `).join('');
        nav.addEventListener('click', (e) => {
          const btn = e.target.closest('.pro-nav-chip');
          if (!btn) return;
          const target = els.grid.querySelector(
            `.grid-section-header[data-section="${btn.dataset.section}"]`
          );
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        // Place la nav DIRECTEMENT après les onglets (avant home-row + grille)
        // pour qu'elle soit immédiatement visible — le user sait des le premier
        // regard qu'il y a 2 sections, sans avoir a scroller.
        const oldNav = document.querySelector('.pro-section-nav');
        if (oldNav) oldNav.remove();
        const homeRow = document.getElementById('home-row');
        const main = document.querySelector('.main');
        if (homeRow && homeRow.parentNode === main) {
          main.insertBefore(nav, homeRow);
        } else {
          els.grid.parentNode.insertBefore(nav, els.grid);
        }
      }

      let globalIdx = 0;
      const renderSection = (key, label, sectionApps) => {
        if (!sectionApps || sectionApps.length === 0) return;
        const header = document.createElement('div');
        header.className = 'grid-section-header';
        header.dataset.section = key;
        header.innerHTML =
          '<span class="grid-section-line"></span>' +
          `<h2 class="grid-section-title">${escapeHtml(label)}</h2>` +
          '<span class="grid-section-line"></span>';
        frag.appendChild(header);
        for (const app of sectionApps) {
          const tile = buildTile(app);
          tile.style.setProperty('--tile-index', globalIdx++);
          frag.appendChild(tile);
        }
      };
      for (const { key, label, apps: sectionApps } of sectionsToRender) {
        renderSection(key, label, sectionApps);
      }
    } else {
      // Pas de pro tab : on retire la nav si elle existe (changement d'onglet)
      const oldNav = document.querySelector('.pro-section-nav');
      if (oldNav) oldNav.remove();
      apps.forEach((app, i) => {
        const tile = buildTile(app);
        // Index pour cascade d'entree (CSS animation-delay calcule via var)
        tile.style.setProperty('--tile-index', i);
        frag.appendChild(tile);
      });
    }
    els.grid.appendChild(frag);

    // Si une fiche produit est actuellement affichee, on la repaint aussi
    // pour que les CTA suivent l'etat (achat, install termine, etc.).
    if (state.openProductId) {
      const openApp = state.apps.find(a => a.id === state.openProductId);
      if (openApp) renderProductPage(openApp);
      else hideProductPage();
    }
  }

  // Onglets de catégories — design "section magazine" : titres Cinzel
  // côte-à-côte, soulignement doré qui glisse de l'un à l'autre, compteur en
  // chiffre romain italique discret. Pas de container en pilule, pas de bouton
  // "tab" classique : on assume le côté éditorial de la Table Ronde.
  //
  // Le glider est un élément absolu unique qui se positionne sous l'onglet
  // actif et s'anime via translateX/scaleX. Donne une sensation de fluidité
  // qu'on n'aurait pas avec un ::after par tab.
  function renderTabs() {
    const host = els.tabs;
    if (!host) return;
    const cats = state.categories || [];
    if (cats.length < 2) { host.innerHTML = ''; host.classList.add('hidden'); return; }
    host.classList.remove('hidden');

    // Convertit un nombre en chiffres romains pour l'esthétique manuscrite.
    // Limite raisonnable (jusqu'à 30 pour l'instant) ; au-delà on tombe sur
    // le chiffre arabe pour ne pas avoir de chaîne illisible.
    const toRoman = (n) => {
      if (!n || n < 1 || n > 30) return String(n || 0);
      const map = [
        ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
      ];
      let out = '';
      for (const [glyph, val] of map) {
        while (n >= val) { out += glyph; n -= val; }
      }
      return out;
    };

    const activeCat = cats.find(c => c.id === state.activeCategory);
    const activeSubtitle = activeCat ? (activeCat.subtitle || activeCat.description || '') : '';

    host.innerHTML = `
      <div class="main-tabs-row">
        <span class="main-tab-glider" aria-hidden="true"></span>
        ${cats.map(c => {
          const isActive = c.id === state.activeCategory;
          return `
            <button type="button" role="tab"
                    class="main-tab${isActive ? ' is-active' : ''}"
                    data-cat="${escapeHtml(c.id)}"
                    aria-selected="${isActive ? 'true' : 'false'}">
              <span class="main-tab-label">${escapeHtml(c.label)}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div class="main-tabs-subtitle">${escapeHtml(activeSubtitle)}</div>
    `;

    host.querySelectorAll('.main-tabs-row .main-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cat;
        if (!id || id === state.activeCategory) return;
        setActiveCategory(id);
        // On scroll en haut quand on change d'onglet pour ne pas atterrir
        // au milieu d'une grille plus courte.
        const main = document.querySelector('.main');
        if (main) main.scrollTop = 0;
        render();
      });
    });

    // Positionne le glider sous l'onglet actif après la peinture du DOM.
    // requestAnimationFrame pour que les getBoundingClientRect soient corrects.
    requestAnimationFrame(() => positionTabGlider());
  }

  // Place et dimensionne le trait doré sous l'onglet actif. La transition CSS
  // (left + width) anime le glissement quand on change d'onglet.
  function positionTabGlider() {
    const host = els.tabs;
    if (!host) return;
    const row = host.querySelector('.main-tabs-row') || host;
    const active = row.querySelector('.main-tab.is-active');
    const glider = row.querySelector('.main-tab-glider');
    if (!active || !glider) return;
    const rowRect = row.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    glider.style.left = `${tabRect.left - rowRect.left}px`;
    glider.style.width = `${tabRect.width}px`;
  }

  // Le glider doit aussi se repositionner si la fenêtre est redimensionnée
  // (largeur des onglets qui change avec la police, viewport, etc.).
  window.addEventListener('resize', () => positionTabGlider());

  // Bascule de catégorie active + persistance dans les prefs (le user
  // retrouve son onglet à la prochaine ouverture de l'app). Fire-and-forget
  // sur l'IPC : si ça échoue, c'est juste qu'au prochain lancement il
  // tombera sur l'onglet par défaut, pas dramatique.
  function setActiveCategory(id) {
    if (!id) return;
    state.activeCategory = id;
    state.prefs = state.prefs || {};
    state.prefs.lastCategory = id;
    if (window.triskell?.prefs?.setLastCategory) {
      window.triskell.prefs.setLastCategory(id).catch(() => {});
    }
  }

  function filteredApps() {
    const cat = state.activeCategory;
    let list = state.apps.slice();
    // Filtre par onglet (catégorie). Si pas de catégorie active, on montre tout.
    if (cat) list = list.filter(a => (a.category || '') === cat);
    return list.sort(compareAppsByImportance);
  }

  // Tri par importance pour qu'au premier coup d'oeil l'utilisateur voie
  // ce qui est actionnable maintenant, et que les "En quete" soient en bas.
  function compareAppsByImportance(a, b) {
    return statePriority(a) - statePriority(b);
  }
  function statePriority(app) {
    const s = tileStateOf(app);
    if (s === 'update-available')    return 0;   // top : faut agir
    if (s === 'owned-not-installed') return 1;   // adoube, faut installer
    if (s === 'installed')           return 2;   // a la table, pret
    if (s === 'not-owned' && app.featured) return 3;   // recommande
    if (s === 'not-owned')           return 4;
    if (s === 'service')             return 4;   // produit-service au meme rang qu'une app a decouvrir
    if (s === 'coming-soon')         return 5;   // bottom
    return 6;
  }

  // ============================================================================
  // ACCOUNT PILL (avatar + nom dans le header)
  // ============================================================================
  function accountInitials() {
    const name = (state.prefs.displayName || '').trim();
    const email = state.user?.email || '';
    if (name) {
      const parts = name.split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    return (email.split('@')[0].slice(0, 2) || '?').toUpperCase();
  }

  function renderAccountPill() {
    if (!els.accountAvatar || !els.accountName) return;
    const name = (state.prefs.displayName || '').trim();
    const email = state.user?.email || '';
    const display = name || email.split('@')[0] || 'Compagnon';

    els.accountName.textContent = display;
    els.accountBtn.title = email ? `${display} · ${email}` : display;

    // Avatar : photo si on en a une, sinon initiales colorees
    const avatar = state.prefs.avatar;
    els.accountAvatar.innerHTML = '';
    els.accountAvatar.style.background = '';
    if (avatar && avatar.startsWith('data:image/')) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = avatar;
      els.accountAvatar.appendChild(img);
    } else {
      els.accountAvatar.textContent = accountInitials();
      const seed = hashStr(email || display);
      const hue = seed % 360;
      els.accountAvatar.style.background =
        `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 50) % 360}, 65%, 50%))`;
    }

    // Statut sous le nom : "X adoubé(s)" ou "Visiteur"
    const owned = Object.keys(state.licenses || {}).length;
    if (els.accountStatus) {
      if (owned > 0) {
        els.accountStatus.textContent = `${owned} adoubé${owned > 1 ? 's' : ''}`;
        els.accountStatus.style.color = 'var(--gold)';
      } else {
        els.accountStatus.textContent = 'Visiteur';
        els.accountStatus.style.color = 'var(--text-muted)';
      }
    }
  }

  // FNV-1a 32-bit — couleur d'avatar stable par email
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  // Construit la salutation. Priorite : displayName personnalise > prenom
  // extrait de l'email > "Bienvenue a la Table" si l'email est generique
  // (contact@, hello@, info@, ...).
  const GENERIC_EMAIL_PREFIXES = new Set([
    'contact', 'hello', 'info', 'admin', 'support', 'noreply', 'no-reply',
    'team', 'service', 'help', 'mail', 'mailbox', 'webmaster', 'postmaster',
    'sales', 'orders', 'billing', 'office', 'bonjour', 'salut'
  ]);

  function makeGreeting(displayName, email) {
    const cleanName = (displayName || '').trim();
    if (cleanName) return `Salut ${cleanName}`;

    const prefix = (email || '').split('@')[0].split('.')[0].toLowerCase()
      .replace(/[^a-z0-9à-ÿ]/gi, '');
    if (!prefix || GENERIC_EMAIL_PREFIXES.has(prefix)) {
      return 'Bienvenue à la Table';
    }
    return `Salut ${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}`;
  }

  // Crée (ou réutilise) le wrapper qui héberge le bandeau d'accueil et le
  // bundle "Compléter ta Table". Permet d'avoir un mode compact où les deux
  // se mettent côte-à-côte centrés quand l'annonce est dismissée.
  function ensureHomeRow() {
    const main = document.querySelector('.main');
    let row = document.getElementById('home-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'home-row';
      row.className = 'home-row';
      // Place le row juste après les onglets, avant la grille.
      const grid = document.getElementById('grid');
      main.insertBefore(row, grid);
    }
    return row;
  }

  // Bandeau personnalisé en haut : salutation + compte rendu + raccourcis derniers utilisés.
  function renderHomeBanner() {
    const row = ensureHomeRow();
    let host = document.getElementById('home-banner');
    if (!host) {
      host = document.createElement('section');
      host.id = 'home-banner';
      host.className = 'home-banner';
      row.insertBefore(host, row.firstChild);
    } else if (host.parentElement !== row) {
      // Si le bandeau existait ailleurs (ancien comportement), on le rapatrie.
      row.insertBefore(host, row.firstChild);
    }
    const installedCount = Object.keys(state.installs).length;
    const ownedCount = Object.keys(state.licenses).length;
    const hello = makeGreeting(state.prefs.displayName, state.user.email);

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

    // Annonce dynamique (mise à jour, nouveau produit, promo...).
    renderAnnouncement();
    // Onboarding : bandeau extra pour les nouveaux comptes (0 licence + 0 install)
    renderOnboardingHint(ownedCount, installedCount);
    // Bascule éventuelle en mode compact (côte-à-côte avec le bundle)
    syncHomeRowLayout();
  }

  // Bascule le wrapper .home-row entre 2 modes :
  //  - mode normal (colonne) : bandeau pleine largeur en haut, bundle dessous
  //  - mode compact (ligne)  : bandeau réduit à son contenu + bundle, côte-à-côte
  //                            centrés sur la page.
  // Le mode compact s'active uniquement quand l'annonce a été dismissée ET qu'il
  // y a un bundle à afficher à droite. Sans bundle, on garde le bandeau seul
  // pleine largeur.
  function syncHomeRowLayout() {
    const row = document.getElementById('home-row');
    if (!row) return;
    const hasAnnouncement = !!document.getElementById('announcement-banner');
    const bundles = document.getElementById('bundles-section');
    const hasBundle = !!(bundles && bundles.children.length > 0);
    const shouldBeCompact = !hasAnnouncement && hasBundle;
    const isCompact = row.classList.contains('is-compact');
    if (shouldBeCompact === isCompact) return;
    row.classList.toggle('is-compact', shouldBeCompact);
  }

  // Bandeau d'annonce edite par Triskell dans apps.json. Affiche la derniere
  // annonce non dismissee par cet utilisateur. Bouton X pour la cacher
  // definitivement (l'id est stocke dans prefs.dismissedAnnouncements).
  // Pour pousser une nouvelle annonce, changer l'id dans apps.json.
  function renderAnnouncement() {
    const homeBanner = document.getElementById('home-banner');
    let host = document.getElementById('announcement-banner');
    const a = state.announcement;
    const dismissed = (state.prefs.dismissedAnnouncements || []);

    if (!a || !a.id || dismissed.includes(a.id)) {
      if (host) host.remove();
      return;
    }

    // Insere dans #home-banner pour combler le vide a droite du "Salut X 👋"
    // au lieu d'un bandeau separe empile dessous (etait redondant et coupait
    // la verticalite de la page).
    if (!host) {
      host = document.createElement('div');
      host.id = 'announcement-banner';
      if (homeBanner) homeBanner.appendChild(host);
      else {
        const main = document.querySelector('.main');
        if (main) main.appendChild(host);
      }
    } else if (homeBanner && host.parentElement !== homeBanner) {
      // Si l'annonce a ete creee ailleurs (ancien comportement), on la rapatrie
      homeBanner.appendChild(host);
    }

    const KIND_META = {
      new:    { icon: '🎉', label: 'Nouveauté', cls: 'announcement-new' },
      update: { icon: '↻',  label: 'Mise à jour', cls: 'announcement-update' },
      promo:  { icon: '💰', label: 'Promo',     cls: 'announcement-promo' },
      info:   { icon: '📣', label: 'Info',      cls: 'announcement-info' }
    };
    const meta = KIND_META[a.kind] || KIND_META.info;
    host.className = `announcement-banner ${meta.cls}`;

    const ctaHtml = a.cta && a.cta.label
      ? `<button class="announcement-cta">${escapeHtml(a.cta.label)} <span class="announcement-cta-arrow">→</span></button>`
      : '';

    host.innerHTML = `
      <span class="announcement-icon" aria-hidden="true">${meta.icon}</span>
      <div class="announcement-body">
        <div class="announcement-title">
          <span class="announcement-kind">${meta.label}</span>
          <strong>${escapeHtml(a.title || '')}</strong>
        </div>
        <p class="announcement-message">${escapeHtml(a.message || '')}</p>
      </div>
      <div class="announcement-actions">
        ${ctaHtml}
        <button class="announcement-dismiss" title="Masquer cette annonce" aria-label="Masquer">×</button>
      </div>
    `;

    const dismissBtn = host.querySelector('.announcement-dismiss');
    dismissBtn.addEventListener('click', () => {
      // Optimistic dismiss : on cache tout de suite + on persiste asynchrone.
      state.prefs.dismissedAnnouncements = [
        ...(state.prefs.dismissedAnnouncements || []), a.id
      ];
      // Animation de bascule : on utilise View Transitions API pour que la
      // disparition de l'annonce ET la réorganisation banner+bundle (passage
      // côte-à-côte) soient interpolées en douceur. Fallback: pas d'anim.
      const apply = () => { host.remove(); syncHomeRowLayout(); };
      if (typeof document.startViewTransition === 'function') {
        document.startViewTransition(apply);
      } else {
        apply();
      }
      window.triskell.prefs.dismissAnnouncement(a.id).catch(err => {
        console.error('dismissAnnouncement failed', err);
      });
    });

    const ctaBtn = host.querySelector('.announcement-cta');
    if (ctaBtn && a.cta) {
      ctaBtn.addEventListener('click', () => {
        const { action, value } = a.cta;
        if (action === 'open-product' && value) {
          const app = state.apps.find(x => x.id === value);
          if (app) showProductPage(app);
        } else if (action === 'open-url' && value) {
          window.triskell.openExternal?.(value);
        } else if (action === 'open-completion') {
          const missing = missingPremiumApps();
          if (missing.length >= 2 && state.completionBundle?.discounts) {
            openCompletionPickerModal(missing, state.completionBundle.discounts);
          }
        } else if (action === 'open-category' && value) {
          // Active l'onglet ciblé et redessine la grille filtrée.
          setActiveCategory(value);
          const main = document.querySelector('.main');
          if (main) main.scrollTop = 0;
          render();
        }
      });
    }
  }

  // Onboarding pour les nouveaux comptes : affiche un guide rapide quand
  // l'utilisateur a 0 licence et 0 install. On le cache des qu'il a au moins
  // un produit ou une licence.
  function renderOnboardingHint(ownedCount, installedCount) {
    const main = document.querySelector('.main');
    let host = document.getElementById('onboarding-hint');
    const shouldShow = ownedCount === 0 && installedCount === 0
                    && !state.prefs.onboardingDismissed;
    if (!shouldShow) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('section');
      host.id = 'onboarding-hint';
      host.className = 'onboarding-hint';
      const banner = document.getElementById('home-banner');
      if (banner && banner.nextSibling) main.insertBefore(host, banner.nextSibling);
      else main.appendChild(host);
    }
    // Trouve l'app "phare" a recommander (la featured, sinon la 1ere premium)
    const featured = state.apps.find(a => a.featured)
                  || state.apps.find(a => a.tier === 'premium');

    host.innerHTML = `
      <button class="onboarding-close" id="onboarding-dismiss" aria-label="Fermer">×</button>
      <div class="onboarding-step">
        <span class="onboarding-num">1</span>
        <div>
          <p class="onboarding-title">Bienvenue à la Table Ronde 🛡️</p>
          <p class="muted small">5 produits desktop, paiement unique, à vie. Pas d'abonnement, pas de tracker, tout fonctionne hors ligne.</p>
        </div>
      </div>
      <div class="onboarding-step">
        <span class="onboarding-num">2</span>
        <div>
          <p class="onboarding-title">Choisis ton premier compagnon</p>
          <p class="muted small">${featured ? `On te recommande <strong>${escapeHtml(featured.name)}</strong> — ${escapeHtml(featured.tagline || '')}` : 'Parcours les tuiles ci-dessous.'}</p>
          ${featured ? `<button class="onboarding-cta" id="onboarding-feature">Voir ${escapeHtml(featured.name)}</button>` : ''}
        </div>
      </div>
      <div class="onboarding-step">
        <span class="onboarding-num">3</span>
        <div>
          <p class="onboarding-title">Plusieurs outils en tête ? Le pack Table Ronde est jusqu'à -30 %</p>
          <p class="muted small">Plus tu en prends, plus c'est avantageux. Le bundle apparaît automatiquement quand tu en possèdes au moins 1.</p>
        </div>
      </div>
    `;
    host.querySelector('#onboarding-dismiss')?.addEventListener('click', async () => {
      state.prefs.onboardingDismissed = true;
      if (window.triskell.prefs && window.triskell.prefs.setOnboardingDismissed) {
        await window.triskell.prefs.setOnboardingDismissed(true);
      }
      host.remove();
    });
    host.querySelector('#onboarding-feature')?.addEventListener('click', () => {
      if (featured) showProductPage(featured);
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

  // Liste des apps payantes manquantes (premium, non possedees, non gratuites).
  // Sert de base au bundle dynamique "Compléter ta Table". On la cantonne a la
  // catégorie active : pas question de bundler du Dénicheur (Pro) avec
  // DéliNote (Quotidien), ce sont deux audiences distinctes.
  function missingPremiumApps() {
    const cat = state.activeCategory;
    return state.apps.filter(a =>
      a.tier === 'premium'
      && !a.comingSoon              // pas vendable encore (AlphaCast, etc.)
      && a.price                    // exige un prix unique (pas un service)
      && !state.licenses[a.id]
      && (!cat || (a.category || '') === cat)
    );
  }

  // Bundles : cartes pleine-largeur au-dessus de la grille produit.
  // Il y a deux sources : (1) les bundles statiques de apps.json (cartes
  // figees, ex. campagnes saisonnieres) ; (2) le completionBundle dynamique
  // qui s'adapte a ce que l'utilisateur possede deja.
  function renderBundles() {
    const row = ensureHomeRow();
    let host = document.getElementById('bundles-section');
    if (!host) {
      host = document.createElement('section');
      host.id = 'bundles-section';
      host.className = 'bundles';
      row.appendChild(host);
    } else if (host.parentElement !== row) {
      row.appendChild(host);
    }

    host.innerHTML = '';

    // 1. Le bundle dynamique de completion : visible si l'user a au moins 1
    //    app premium en main ET qu'il en manque encore au moins 2.
    renderCompletionBundle(host);

    const bundles = (state.bundles || []).filter(b => {
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

  // Calcule le prix bundle pour une selection donnee.
  // Formule : somme des prix individuels × (1 - discount/100).
  // discounts = { "2": 15, "3": 25, "4": 35 } depuis apps.json.
  // Renvoie null si pas de discount configure pour ce count (< 2 par ex).
  function computeBundlePrice(apps, discounts) {
    const count = apps.length;
    const discount = discounts && discounts[String(count)];
    if (typeof discount !== 'number') return null;
    const total = apps.reduce((s, a) => s + (a.price || 0), 0);
    const bundle = Math.round(total * (1 - discount / 100));
    return { count, total, discount, bundle, savings: total - bundle };
  }

  // Carte dynamique "Compléter ta Table" : reduction progressive selon le
  // nombre d'outils restants (-15% pour 2, -25% pour 3, -35% pour 4).
  // Toujours proportionnel : plus de cas ou le bundle revient plus cher
  // que la somme separee, et marges previsibles pour Triskell.
  function renderCompletionBundle(host) {
    const cb = state.completionBundle;
    if (!cb || !cb.discounts) return;

    const missing = missingPremiumApps();
    const count = missing.length;
    if (count < 2) return;

    const calc = computeBundlePrice(missing, cb.discounts);
    if (!calc) return;

    const card = document.createElement('article');
    card.className = 'bundle-card bundle-completion' + (cb.comingSoon ? ' bundle-soon' : '');

    const savingsPercent = Math.round((calc.savings / calc.total) * 100);
    const original = `<span class="price-old">${calc.total} €</span>`;
    const dynamicNote = `Économise ${calc.savings} € (-${savingsPercent} %) par rapport aux achats séparés`;
    const note = `<p class="bundle-note">${escapeHtml(dynamicNote)}</p>`;
    const missingNames = missing.map(a => a.name).join(', ');

    card.innerHTML = `
      <div class="bundle-icon"></div>
      <div class="bundle-body">
        <div class="bundle-tags">
          <span class="tag tag-suite">Bundle</span>
          <span class="tag tag-completion">${count} manquant${count > 1 ? 's' : ''}</span>
          ${cb.comingSoon ? '<span class="tag tag-soon">En quête</span>' : ''}
        </div>
        <h3 class="bundle-title">${escapeHtml(cb.name)}</h3>
        <p class="bundle-tagline">${escapeHtml(
          (cb.taglineByCategory && cb.taglineByCategory[state.activeCategory])
            || cb.tagline || ''
        )}</p>
        <p class="bundle-missing muted small">Il te manque : <strong>${escapeHtml(missingNames)}</strong></p>
        <div class="bundle-price">
          <span class="price-current">${calc.bundle} €</span>
          ${original}
        </div>
        ${note}
      </div>
      <div class="bundle-actions"></div>
    `;
    if (cb.icon) {
      const iconBox = card.querySelector('.bundle-icon');
      const img = document.createElement('img');
      img.alt = '';
      img.src = cb.icon;
      iconBox.appendChild(img);
    }
    const actions = card.querySelector('.bundle-actions');
    if (cb.comingSoon) {
      actions.appendChild(makeBtn('Bientôt', 'btn-disabled', null, true));
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-completion';
      btn.innerHTML = `
        <span class="btn-completion-main">Compléter ma Table <span class="btn-completion-arrow">→</span></span>
        <span class="btn-completion-sub">Sélection à la carte</span>
      `;
      btn.addEventListener('click',
        () => openCompletionPickerModal(missing, cb.discounts));
      actions.appendChild(btn);
    }
    host.appendChild(card);
  }

  // ============================================================================
  // MODALE "Compléter ma Table" — sélection à la carte
  // ============================================================================
  // L'utilisateur ne veut pas forcement tous les outils manquants. On lui
  // ouvre une modale avec une checkbox par outil, et on recalcule le prix
  // bundle en temps reel selon le nombre coche. Sous 2 outils coches, plus
  // de tier bundle valide -> on bascule l'UX vers l'achat individuel.
  function openCompletionPickerModal(missing, discounts) {
    const selected = new Set(missing.map(a => a.id));

    const rowsHtml = missing.map(a => `
      <label class="picker-row" data-id="${escapeHtml(a.id)}">
        <input type="checkbox" class="picker-check" checked
               data-id="${escapeHtml(a.id)}"
               data-price="${a.price || 0}" />
        <span class="picker-icon">${a.icon
          ? `<img src="${escapeHtml(a.icon)}" alt="" />`
          : escapeHtml(makeInitials(a.name))}</span>
        <span class="picker-info">
          <span class="picker-name">${escapeHtml(a.name)}</span>
          <span class="picker-tagline muted small">${escapeHtml(a.tagline || '')}</span>
        </span>
        <span class="picker-price">${a.price || 0} €</span>
      </label>
    `).join('');

    const bodyHtml = `
      <p style="margin:0 0 14px;color:var(--text-dim);font-size:13px;line-height:1.5;">
        Coche les outils que tu veux ajouter à ta Table. Le prix bundle se
        recalcule selon le nombre coché.
      </p>
      <div class="picker-list">${rowsHtml}</div>
      <div class="picker-summary">
        <div class="picker-summary-row">
          <span>Achat séparé</span>
          <span class="picker-individual"></span>
        </div>
        <div class="picker-summary-row picker-summary-bundle">
          <span class="picker-bundle-label"></span>
          <span class="picker-bundle"></span>
        </div>
        <div class="picker-summary-row picker-summary-savings">
          <span>Économie</span>
          <span class="picker-savings"></span>
        </div>
        <p class="picker-hint muted small"></p>
      </div>
    `;

    openModal({
      title: 'Compléter ma Table',
      bodyHtml,
      ctaLabel: 'Acheter',
      onCta: async () => {
        const ids = [...selected];
        if (ids.length === 1) {
          // Un seul produit -> on bascule sur le tunnel d'achat individuel.
          const app = missing.find(a => a.id === ids[0]);
          closeModal();
          if (app && app.buyUrl) {
            window.triskell.purchase.open(app.buyUrl, app.id);
          } else if (app) {
            onInfo(app);
          }
          return;
        }
        if (ids.length < 2) return; // CTA disabled

        // On envoie aussi le prix calcule cote client pour affichage cohérent ;
        // le serveur le RECALCULE pour ne pas faire confiance au client.
        const calc = computeBundlePrice(
          missing.filter(a => selected.has(a.id)),
          discounts
        );
        const r = await window.triskell.purchase.openCompletion(
          ids.length, ids, calc ? calc.bundle : null
        );
        if (r && !r.ok) {
          let msg;
          if (r.error === 'discount-not-configured' || r.error === 'stripe-not-configured') {
            msg = 'Le pack n\'est pas encore activé côté paiement. Notre équipe est prévenue, on revient vers toi vite.';
          } else if (r.error === 'not-authenticated') {
            msg = 'Session expirée. Reconnecte-toi pour finaliser ton achat.';
          } else if (r.error === 'invalid-product-list') {
            msg = 'Sélection invalide (produits inconnus côté serveur). Recharge l\'app et réessaie.';
          } else if (r.error === 'no-url') {
            msg = 'Le serveur n\'a pas renvoyé de lien Stripe. Réessaie dans un instant.';
          } else if (r.error === 'stripe-failed') {
            msg = `Erreur Stripe : ${r.message || 'inconnue'}.`;
          } else {
            msg = `Erreur (${r.error || 'inconnue'}) — réessaie dans un instant.`;
          }
          showToast({ kind: 'error', title: 'Compléter ma Table', message: msg, timeout: 9000 });
          console.error('[completion-checkout] error:', r);
          return;
        }
        closeModal();
      }
    });

    const checks = els.modalBody.querySelectorAll('.picker-check');
    const $individual = els.modalBody.querySelector('.picker-individual');
    const $bundleLabel = els.modalBody.querySelector('.picker-bundle-label');
    const $bundle = els.modalBody.querySelector('.picker-bundle');
    const $savingsRow = els.modalBody.querySelector('.picker-summary-savings');
    const $savings = els.modalBody.querySelector('.picker-savings');
    const $hint = els.modalBody.querySelector('.picker-hint');

    function refresh() {
      const selectedApps = missing.filter(a => selected.has(a.id));
      const count = selectedApps.length;
      const individualTotal = selectedApps.reduce((s, a) => s + (a.price || 0), 0);

      $individual.textContent = `${individualTotal} €`;

      if (count === 0) {
        $bundleLabel.textContent = 'Bundle';
        $bundle.textContent = '—';
        $savingsRow.style.display = 'none';
        $hint.textContent = 'Coche au moins 2 outils pour activer le bundle.';
        els.modalCta.disabled = true;
        els.modalCta.classList.add('btn-disabled');
        els.modalCta.textContent = 'Acheter';
        return;
      }
      if (count === 1) {
        $bundleLabel.textContent = 'Bundle';
        $bundle.textContent = '— (min. 2)';
        $savingsRow.style.display = 'none';
        $hint.textContent = 'Avec 1 seul outil, autant l\'acheter directement (le bundle ne s\'active qu\'à partir de 2).';
        els.modalCta.disabled = false;
        els.modalCta.classList.remove('btn-disabled');
        const only = selectedApps[0];
        els.modalCta.textContent = `Acheter ${only.name} — ${only.price || 0} €`;
        return;
      }
      const calc = computeBundlePrice(selectedApps, discounts);
      if (!calc) {
        $bundleLabel.textContent = 'Bundle';
        $bundle.textContent = '—';
        $savingsRow.style.display = 'none';
        $hint.textContent = 'Aucune remise configurée pour cette quantité.';
        els.modalCta.disabled = true;
        els.modalCta.classList.add('btn-disabled');
        return;
      }
      const pct = Math.round((calc.savings / calc.total) * 100);
      $bundleLabel.textContent = `Bundle (${count} outil${count > 1 ? 's' : ''} · −${calc.discount} %)`;
      $bundle.textContent = `${calc.bundle} €`;
      $savingsRow.style.display = '';
      $savings.textContent = `−${calc.savings} € (−${pct} %)`;
      $hint.textContent = '';
      els.modalCta.disabled = false;
      els.modalCta.classList.remove('btn-disabled');
      els.modalCta.textContent = `Acheter ${count} outil${count > 1 ? 's' : ''} — ${calc.bundle} €`;
    }

    checks.forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) selected.add(id);
        else selected.delete(id);
        refresh();
      });
    });
    refresh();
  }

  // Determine l'etat affiche d'un produit, et donc les actions disponibles.
  function tileStateOf(app) {
    if (app.comingSoon) return 'coming-soon';
    // Produit "service" (Triskell Studio agence, Eliks Studio) : ce n'est pas un
    // logiciel à installer, c'est une offre humaine. On a un état dédié pour
    // afficher des CTA "Voir l'offre" / "Nous écrire" au lieu d'Installer/Acheter.
    if (app.kind === 'service' || app.tier === 'service') return 'service';
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

  // Vue Découverte : un seul produit a la fois en grand, navigation flèches.
  // L'index courant est garde dans state.discoverIndex (par categorie pour
  // que basculer d'onglet reset proprement).
  function renderDiscoverView(apps) {
    const safeApps = apps.filter(a => !a.comingSoon);
    const list = safeApps.length ? safeApps : apps;
    if (list.length === 0) return;

    const key = state.activeCategory || 'all';
    state.discoverIndex = state.discoverIndex || {};
    if (typeof state.discoverIndex[key] !== 'number'
        || state.discoverIndex[key] >= list.length
        || state.discoverIndex[key] < 0) {
      state.discoverIndex[key] = 0;
    }
    let idx = state.discoverIndex[key];

    const wrapper = document.createElement('div');
    wrapper.className = 'discover-wrapper';
    wrapper.innerHTML = `
      <button type="button" class="discover-nav discover-nav-prev" aria-label="Précédent">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 6 9 12 15 18"/></svg>
      </button>
      <div class="discover-stage" id="discover-stage"></div>
      <button type="button" class="discover-nav discover-nav-next" aria-label="Suivant">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
      </button>
      <div class="discover-dots" role="tablist" aria-label="Naviguer entre les produits">
        ${list.map((_, i) => `<button type="button" class="discover-dot${i === idx ? ' is-active' : ''}" data-i="${i}" aria-label="Aller à ${escapeHtml(list[i].name)}"></button>`).join('')}
      </div>
    `;
    els.grid.appendChild(wrapper);

    function paint() {
      const app = list[idx];
      const stage = wrapper.querySelector('#discover-stage');
      stage.innerHTML = '';
      // On reutilise buildTile + on lui colle la classe is-featured pour
      // beneficier du grand layout hero (icône XL, titre Cinzel, etc.).
      const tile = buildTile(app);
      tile.classList.add('is-featured', 'discover-card');
      tile.style.setProperty('--tile-index', 0);
      stage.appendChild(tile);
      wrapper.querySelectorAll('.discover-dot').forEach((d, i) => {
        d.classList.toggle('is-active', i === idx);
      });
      wrapper.querySelector('.discover-nav-prev').disabled = list.length < 2;
      wrapper.querySelector('.discover-nav-next').disabled = list.length < 2;
    }

    function go(delta) {
      if (list.length < 2) return;
      idx = (idx + delta + list.length) % list.length;
      state.discoverIndex[key] = idx;
      paint();
    }

    wrapper.querySelector('.discover-nav-prev').addEventListener('click', () => go(-1));
    wrapper.querySelector('.discover-nav-next').addEventListener('click', () => go(1));
    wrapper.querySelectorAll('.discover-dot').forEach(d => {
      d.addEventListener('click', () => {
        const i = parseInt(d.dataset.i, 10);
        if (!isNaN(i) && i !== idx) {
          idx = i;
          state.discoverIndex[key] = idx;
          paint();
        }
      });
    });

    // Navigation au clavier (flèches gauche/droite)
    if (!state._discoverKeyBound) {
      state._discoverKeyBound = true;
      document.addEventListener('keydown', (e) => {
        if (state.prefs?.viewMode !== 'discover') return;
        if (state.openProductId) return; // fiche produit ouverte
        if (e.target.matches('input, textarea, [contenteditable]')) return;
        if (e.key === 'ArrowLeft') {
          const prev = document.querySelector('.discover-nav-prev');
          if (prev) prev.click();
        } else if (e.key === 'ArrowRight') {
          const next = document.querySelector('.discover-nav-next');
          if (next) next.click();
        }
      });
    }

    paint();
  }

  function buildTile(app) {
    const tile = document.createElement('div');
    const tileState = tileStateOf(app);
    const initials = makeInitials(app.name);

    // Classes d'etat utilisees par le CSS pour donner une hierarchie visuelle.
    // is-featured = layout Hero 2×2 dans la grille. Choisi DYNAMIQUEMENT par
    // pickHero() en fonction de ce que l'user possede et utilise (cf logique
    // commerciale + usage). state.hero.id contient l'id retenu.
    const isHeroPick = !!(state.hero && state.hero.id === app.id);
    const stateClass = `is-${tileState}`;
    const featuredClass = isHeroPick ? ' is-featured' : '';
    tile.className = `tile ${stateClass}${featuredClass}`;
    tile.dataset.id = app.id;

    const tags = [];
    const isService = app.kind === 'service' || app.tier === 'service';
    // Le tag "Service" doré est volontairement RETIRÉ ici : le bandeau
    // ✦ SERVICE ✦ horizontal en haut de la card (CSS .tile.is-service::before)
    // signale déjà clairement que c'est un service. Doubler les signaux
    // brouillerait la hiérarchie visuelle.
    if (app.tier === 'free' && !isService)                       tags.push('<span class="tag tag-free">Gratuit</span>');
    if (state.licenses[app.id])                                  tags.push('<span class="tag tag-owned">Adoubé</span>');
    if (app.comingSoon)                                          tags.push('<span class="tag tag-soon">En quête</span>');
    if (state.installs[app.id] && !app.comingSoon)               tags.push('<span class="tag tag-installed">À ta Table</span>');
    if (tileStateOf(app) === 'update-available')                 tags.push('<span class="tag tag-update">Mise à jour</span>');

    const ownedAlready = state.licenses[app.id];
    const priceHtml = renderPriceBlock(app, ownedAlready);

    // Ruban en coin : on l'affiche uniquement sur la card hero, et le label
    // s'adapte au contexte (À découvrir / Populaire / Tu y reviens souvent).
    // On masque sur les apps possédées+installées de la même catégorie pour
    // ne pas spammer (uniquement la hero pickée affiche le ruban).
    const featuredRibbon = (isHeroPick && state.hero?.label)
      ? `<span class="tile-ribbon">${escapeHtml(state.hero.label)}</span>`
      : '';

    // Indice de cliquabilite : revele au hover (CSS), masque sur coming-soon.
    // aria-hidden car c'est un signal purement visuel — la tuile entiere est
    // deja cliquable et le screen reader n'a pas besoin de cette redondance.
    // Indice top-droite discret : juste une fleche, masque sur coming-soon
    // et sur les tuiles featured (le ribbon "Populaire" prend deja le coin).
    const hintHtml = (app.comingSoon || (app.featured && tileState === 'not-owned'))
      ? ''
      : '<span class="tile-hint" aria-hidden="true" title="Voir la fiche">&rarr;</span>';

    // HERO : on remplit la grosse card 2×2 avec ce qui est le plus parlant
    // selon ce que l'app expose dans apps.json :
    //  - tools[]    -> "X outils dans ta Suite" + pastilles (Suite des Héros)
    //  - features[] -> top features en pastilles (DéliNote, Studio PDF…)
    //  - sinon      -> description tronquee
    const isHero = isHeroPick;
    let heroBlockHtml = '';
    if (isHero) {
      if (Array.isArray(app.tools) && app.tools.length) {
        const visible = app.tools.slice(0, 7);
        const overflow = app.tools.length - visible.length;
        heroBlockHtml = `
          <div class="tile-hero-block">
            <div class="tile-hero-count">
              <strong>${app.tools.length}</strong> outils dans ta Suite
            </div>
            <div class="tile-hero-pills">
              ${visible.map(t => `<span class="tile-hero-pill">${escapeHtml(t.name)}</span>`).join('')}
              ${overflow > 0 ? `<span class="tile-hero-pill tile-hero-pill-more">+${overflow}</span>` : ''}
            </div>
          </div>
        `;
      } else if (Array.isArray(app.features) && app.features.length) {
        // Top features : on garde les courtes (les longues passent mal en
        // pastille). On split sur " — " et " :" pour ne garder que le bout
        // accrocheur de chaque feature ("Markdown natif" plutôt que toute
        // la phrase explicative).
        const visible = app.features
          .filter(f => f.length <= 90)
          .slice(0, 4);
        heroBlockHtml = `
          <div class="tile-hero-block">
            <div class="tile-hero-count">Ce que tu peux faire</div>
            <div class="tile-hero-pills">
              ${visible.map(f =>
                `<span class="tile-hero-pill">${escapeHtml(f.split(' — ')[0].split(' :')[0].split('(')[0].trim())}</span>`
              ).join('')}
            </div>
          </div>
        `;
      } else if (app.description) {
        const short = app.description.length > 220
          ? app.description.slice(0, 217) + '…'
          : app.description;
        heroBlockHtml = `
          <div class="tile-hero-block">
            <p class="tile-hero-description">${escapeHtml(short)}</p>
          </div>
        `;
      }
    }

    // Pull-quote "argument de vente" : phrase courte et marquante qui occupe
    // la zone hero entre les features et le prix. Edite via apps.json
    // (champ `salesPitch`). La devise (`motto`) est rendue dans le même
    // blockquote, en signature italique sous la citation principale, façon
    // épigraphe de vieux livre. Les deux phrases forment un bloc cohérent.
    // 2 variantes selon que la card est en mode hero ou normale :
    // - hero : grand blockquote avec mark + signature
    // - card normale : pitch court en italique sous la tagline (plus discret)
    let salesPitchHtml = '';
    if (isHero && (app.salesPitch || app.motto)) {
      salesPitchHtml = `<blockquote class="tile-hero-pitch">
          ${app.salesPitch ? `<span class="tile-hero-pitch-mark" aria-hidden="true">&#8220;</span>${escapeHtml(app.salesPitch)}` : ''}
          ${app.motto ? `<cite class="tile-hero-pitch-cite">— ${escapeHtml(app.motto)}</cite>` : ''}
        </blockquote>`;
    } else if (!isHero && (app.salesPitch || app.motto)) {
      // Sur les cards normales : pitch + motto comme sur DéliNote (hero), mais
      // dans un format compact. Le motto en cite italique sous le pitch.
      salesPitchHtml = `<p class="tile-pitch">
        ${app.salesPitch ? `<span class="tile-pitch-mark" aria-hidden="true">&#8220;</span>${escapeHtml(app.salesPitch)}` : ''}
        ${app.motto ? `<cite class="tile-pitch-cite">— ${escapeHtml(app.motto)}</cite>` : ''}
      </p>`;
    }

    tile.innerHTML = `
      ${featuredRibbon}
      ${isHero ? '<span class="tile-hero-watermark" aria-hidden="true"></span>' : ''}
      <div class="tile-head">
        <div class="tile-icon" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="tile-title-block">
          <h3 class="tile-title">${escapeHtml(app.name)}</h3>
          <p class="tile-tagline">${escapeHtml(app.tagline || '')}</p>
        </div>
      </div>
      <div class="tile-tags">${tags.join('')}</div>
      ${heroBlockHtml}
      ${salesPitchHtml}
      ${priceHtml}
      <div class="tile-actions"></div>
      ${hintHtml}
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

    // Clic n'importe ou sur la tuile -> ouvre la fiche dediee.
    // Les boutons d'action a l'interieur arretent la propagation pour rester
    // independants (Convoquer, Installer, etc. ne doivent pas tomber dans
    // l'ouverture de la page).
    tile.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      showProductPage(app);
    });
    actions.addEventListener('click', (e) => e.stopPropagation());

    return tile;
  }

  function renderTileActions(host, app, tileState) {
    host.innerHTML = '';
    switch (tileState) {
      case 'coming-soon': {
        host.appendChild(makeBtn('En quête...', 'btn-disabled', null, true));
        break;
      }
      case 'service': {
        // Produit-service (agence, growth) : CTA primaire vers le site
        // externe + raccourci vers la fiche dediee. Le "Nous ecrire" est
        // disponible depuis la fiche (section "En savoir plus" -> mailto)
        // pour eviter de saturer la tuile et garder le focus sur la
        // decision (visiter ou en savoir plus).
        const svc = app.service || {};
        const primaryLabel = svc.ctaPrimaryLabel || 'Voir l\'offre';
        if (svc.url) {
          host.appendChild(makeBtn(primaryLabel, 'btn-buy', () => onOpenService(app)));
        }
        host.appendChild(makeBtn('Voir la fiche', 'btn-info', () => showProductPage(app)));
        break;
      }
      case 'installing': {
        host.appendChild(makeBtn('Installation...', 'btn-installing', null, true));
        break;
      }
      case 'installed': {
        host.appendChild(makeBtn('Convoquer', 'btn-launch', () => onLaunch(app)));
        host.appendChild(makeBtn('Voir la fiche', 'btn-info', () => showProductPage(app)));
        break;
      }
      case 'update-available': {
        const localVer = state.installs[app.id]?.version;
        const latest = state.versions[app.id];
        const label = latest && latest !== localVer
          ? `↻ Mettre à jour · v${latest}`
          : '↻ Mettre à jour';
        host.appendChild(makeBtn(label, 'btn-update', () => onInstall(app)));
        host.appendChild(makeBtn('Convoquer', 'btn-info', () => onLaunch(app)));
        break;
      }
      case 'owned-not-installed': {
        host.appendChild(makeBtn('Installer', 'btn-launch', () => onInstall(app)));
        host.appendChild(makeBtn('Voir la fiche', 'btn-info', () => showProductPage(app)));
        break;
      }
      case 'not-owned':
      default: {
        // Tunnel Stripe pas encore en place : on capture l'interet au lieu
        // d'envoyer le user vers une landing placeholder qui le perdra.
        let isRealBuyButton = false;
        if (app.buyUrlPlaceholder || app.pendingTunnel) {
          host.appendChild(makeBtn('M\'intéresser', 'btn-buy',
            () => onInterest(app)));
        } else if (app.buyUrl) {
          host.appendChild(makeBtn('Recruter', 'btn-buy',
            () => onBuy(app)));
          isRealBuyButton = true;
        } else {
          host.appendChild(makeBtn('Bientôt en vente', 'btn-disabled', null, true));
        }
        host.appendChild(makeBtn('Voir la fiche', 'btn-info', () => showProductPage(app)));
        // Mention garantie : on l'affiche seulement quand il y a un vrai
        // tunnel d'achat (Recruter), pas pour "M'intéresser" ni "Bientôt en
        // vente" (le user ne paie pas encore -> pas de friction à diminuer).
        if (isRealBuyButton) {
          const note = document.createElement('span');
          note.className = 'tile-guarantee';
          note.innerHTML = '<span class="tile-guarantee-icon" aria-hidden="true">✓</span> Garantie 14 jours · satisfait ou remboursé';
          host.appendChild(note);
        }
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

  // Produit-service : ouvre l'offre externe dans le navigateur du système (pas
  // de fenêtre Electron, pas de tunnel Stripe). C'est une page commerciale,
  // pas un checkout.
  function onOpenService(app) {
    const url = app.service && app.service.url;
    if (!url) return;
    if (window.triskell && window.triskell.openExternal) {
      window.triskell.openExternal(url);
    }
  }

  // Produit-service : compose un mailto avec un sujet pré-rempli pour démarrer
  // l'échange par email. Le mailto est traité par l'OS (client mail par défaut).
  function onContactService(app) {
    const email = app.service && app.service.contactEmail;
    if (!email) return;
    const subject = encodeURIComponent(`Demande ${app.name}`);
    const url = `mailto:${email}?subject=${subject}`;
    if (window.triskell && window.triskell.openExternal) {
      window.triskell.openExternal(url);
    }
  }

  // Bloc prix d'une tuile : barre l'ancien prix s'il y a une promo, masque tout
  // si le user possede deja le produit ou que c'est gratuit. Si l'outil est
  // deja installé sur la machine (détecté par le scan ou installé via le
  // Lanceur), on masque aussi le prix : afficher "27 €" sous une tuile "À ta
  // Table" est visuellement contradictoire et perturbe la lecture.
  function renderPriceBlock(app, ownedAlready) {
    if (ownedAlready) return '';
    if (state.installs && state.installs[app.id]) return '';
    if (app.tier === 'free') return '';
    // Produit-service : pas de prix unique, on affiche un libellé "à partir de"
    // (priceFrom) avec la note tarifaire en dessous.
    if (app.kind === 'service' || app.tier === 'service') {
      if (!app.priceFrom && !app.priceNote) return '';
      const fromLabel = app.priceFrom
        ? `<span class="price-current price-current-service">${escapeHtml(app.priceFrom)}</span>` : '';
      const note = app.priceNote
        ? `<span class="price-note">${escapeHtml(app.priceNote)}</span>` : '';
      return `<div class="price-block price-block-service">${fromLabel}${note}</div>`;
    }
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
      // Si l'install a ete purgee cote main (exe disparu, install fantome
      // d'un installer annule...), on resync le state local pour que la
      // tuile repasse en "Installer" sans attendre un refresh global.
      if (res.error === 'not-installed') {
        try {
          const fresh = await window.triskell.installs.list();
          state.installs = fresh || {};
          render();
        } catch (_) { /* best-effort */ }
      }
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
          if (res.error === 'not-installed') {
            try {
              const fresh = await window.triskell.installs.list();
              state.installs = fresh || {};
              render();
            } catch (_) { /* best-effort */ }
          }
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

  // Capture l'interet d'un user pour un produit pas encore en vente.
  // Appelle le backend (idempotent) puis affiche une modale de confirmation
  // claire ("On te previent en avant-premiere + early-bird discount").
  async function onInterest(app) {
    const res = await window.triskell.interest.notifyMe(app.id);
    if (!res.ok) {
      showToast({
        kind: 'error',
        title: 'Erreur',
        message: res.message || 'Impossible d\'enregistrer ton intérêt. Réessaie.',
        timeout: 8000
      });
      return;
    }
    openModal({
      title: `${app.name} arrive bientôt`,
      bodyHtml: `
        <p style="font-size:15px;line-height:1.6;">
          Tu seras parmi les <strong style="color:var(--gold);">premiers prévenus</strong> au lancement,
          avec une <strong style="color:var(--gold);">remise early-bird</strong> en exclu pour les compagnons
          qui ont attendu.
        </p>
        <p class="muted small" style="margin-top:14px;">
          Notification envoyée à <strong>${escapeHtml(state.user.email)}</strong>.
          Pas de spam — un seul email à la sortie, c'est tout.
        </p>
      `,
      ctaLabel: 'Parfait',
      onCta: closeModal
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
      // Animation de succes sur la tuile fraichement installee : pulse vert
      // autour de la card + grand checkmark ephemere au centre. Renforce le
      // toast (qui peut etre rate si l'oeil est ailleurs) avec un signal
      // localise sur la card concernee.
      requestAnimationFrame(() => {
        const tile = document.querySelector(`.tile[data-id="${app.id}"]`);
        if (tile) {
          tile.classList.add('tile-just-installed');
          setTimeout(() => tile.classList.remove('tile-just-installed'), 1800);
        }
      });
      showToast({
        kind: 'success',
        title: `${app.name} installé`,
        message: 'Tu peux le lancer maintenant.',
        actionLabel: 'Lancer',
        onAction: () => onLaunch(app),
        sound: true
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

    // Description longue
    let descHtml = '';
    if (app.description) {
      descHtml = `<p style="margin-top:14px;line-height:1.55;">${escapeHtml(app.description)}</p>`;
    }

    // Liste des fonctionnalités cles
    let featuresHtml = '';
    if (Array.isArray(app.features) && app.features.length) {
      featuresHtml = `
        <p class="muted" style="margin-top:18px;font-weight:600;color:var(--text);">Ce que tu peux faire :</p>
        <ul style="padding-left:18px;margin:6px 0 0;">
          ${app.features.map(f =>
            `<li class="muted small" style="margin:4px 0;color:var(--text);">${escapeHtml(f)}</li>`
          ).join('')}
        </ul>
      `;
    }

    // Outils inclus (Suite des Heros)
    let toolsHtml = '';
    if (Array.isArray(app.tools) && app.tools.length) {
      toolsHtml = `
        <p class="muted" style="margin-top:18px;font-weight:600;color:var(--text);">Les ${app.tools.length} outils inclus :</p>
        <ul style="padding-left:18px;margin:6px 0 0;">
          ${app.tools.map(t =>
            `<li class="muted small" style="margin:4px 0;"><strong style="color:var(--text);">${escapeHtml(t.name)}</strong> — ${escapeHtml(t.tagline)}</li>`
          ).join('')}
        </ul>
      `;
    }

    // Liens externes (site, CGV, support, etc.)
    let linksHtml = '';
    if (Array.isArray(app.links) && app.links.length) {
      linksHtml = `
        <p class="muted" style="margin-top:18px;font-weight:600;color:var(--text);">En savoir plus :</p>
        <ul style="padding-left:0;margin:6px 0 0;list-style:none;">
          ${app.links.map(l =>
            `<li style="margin:4px 0;"><a href="#" data-external="${escapeHtml(l.url)}" style="color:var(--accent);text-decoration:none;">→ ${escapeHtml(l.label)}</a></li>`
          ).join('')}
        </ul>
      `;
    }

    // Prix
    let priceHtml = '';
    if (!owned && app.price) {
      const original = app.priceOriginal && app.priceOriginal > app.price
        ? `<span class="price-old">${app.priceOriginal} €</span>` : '';
      priceHtml = `
        <div class="price-block" style="margin-top:18px;">
          <span class="price-current">${app.price} €</span>
          ${original}
          ${app.priceNote ? `<span class="price-note">${escapeHtml(app.priceNote)}</span>` : ''}
        </div>
        ${state.promoNote ? `<p class="muted small" style="margin-top:6px;">🎟️ ${escapeHtml(state.promoNote)}</p>` : ''}
      `;
    }

    // Zone sensible : on garde la possibilite de desinstaller (honnetete +
    // RGPD), mais cachee derriere un <details> pour ne pas pousser activement
    // l'utilisateur a desinstaller. Meme pattern que "Supprimer mon compte"
    // dans la modale Compte.
    const uninstallBtn = installed
      ? `
        <details class="account-section danger-zone" style="margin-top:18px;">
          <summary class="danger-summary">Zone sensible</summary>
          <p class="muted small" style="margin:8px 0 6px;">Désinstaller supprime le dossier d'installation local de ${escapeHtml(app.name)}. Ta licence reste valide — tu peux le réinstaller à tout moment.</p>
          <button class="ghost-btn danger-btn" id="uninstall-btn" type="button">Désinstaller ${escapeHtml(app.name)}</button>
        </details>
      `
      : '';

    openModal({
      title: app.name,
      bodyHtml: `
        <p class="muted" style="font-style:italic;">${escapeHtml(app.tagline || '')}</p>
        <p class="muted small">Statut : ${owned ? '<strong style="color:var(--green)">possédé</strong>' : 'non acquis'}${installed ? ' · installé' : ''}</p>
        ${descHtml}
        ${featuresHtml}
        ${toolsHtml}
        ${linksHtml}
        ${priceHtml}
        ${uninstallBtn}
      `,
      ctaLabel: 'OK'
    });

    // Liens externes -> ouvrir dans le navigateur par defaut, pas dans Electron
    document.querySelectorAll('[data-external]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('data-external');
        if (url && window.triskell && window.triskell.openExternal) {
          window.triskell.openExternal(url);
        }
      });
    });

    const ub = document.getElementById('uninstall-btn');
    if (ub) ub.addEventListener('click', () => {
      if (confirm(`Vraiment désinstaller ${app.name} ? Le dossier d'installation sera supprimé.`)) {
        onUninstall(app);
      }
    });
  }

  function humanizeLaunchError(res) {
    if (res.error === 'not-installed') return 'Cet outil n\'est pas encore installé. Clique sur Installer pour le récupérer.';
    if (res.error === 'tool-missing')  return 'Cet outil est manquant dans le dossier d\'install. Réinstalle le pack pour le récupérer.';
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
  // PAGE PRODUIT (fiche dediee plein ecran)
  // ============================================================================
  function bindProductPage() {
    if (els.productBack) {
      els.productBack.addEventListener('click', hideProductPage);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'
          && state.openProductId
          && els.modal.classList.contains('hidden')) {
        hideProductPage();
      }
    });
  }

  function showProductPage(app) {
    state.openProductId = app.id;
    // Memorise la position de scroll de la grille pour la restaurer au retour.
    const main = document.querySelector('.main');
    if (main && !main.classList.contains('hidden')) {
      state.gridScrollY = main.scrollTop;
    }
    renderProductPage(app);
    // Si la fiche etait en cours de fermeture (anim de sortie), on annule pour
    // eviter une transition incoherente quand l'utilisateur clique vite.
    els.productScreen.classList.remove('is-leaving');
    els.productScreen.classList.remove('hidden');
    els.productScreen.setAttribute('aria-hidden', 'false');
    // Cache la grille (header reste visible). On scroll la fiche tout en haut.
    if (main) main.classList.add('hidden');
    els.productScreen.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function hideProductPage() {
    // Si la fiche est deja cachee ou en cours de fermeture, ne rien faire
    // (evite de rejouer l'anim si l'utilisateur spamme Echap ou le bouton).
    if (els.productScreen.classList.contains('hidden')) return;
    if (els.productScreen.classList.contains('is-leaving')) return;

    state.openProductId = null;
    els.productScreen.classList.add('is-leaving');

    const main = document.querySelector('.main');

    // Termine la fermeture apres l'anim de sortie. On ecoute animationend
    // pour rester en phase avec le CSS, avec un fallback timeout au cas ou
    // l'event ne firerait pas (anim coupee, prefers-reduced-motion, etc.).
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      els.productScreen.removeEventListener('animationend', finish);
      els.productScreen.classList.add('hidden');
      els.productScreen.classList.remove('is-leaving');
      els.productScreen.setAttribute('aria-hidden', 'true');
      if (main) {
        main.classList.remove('hidden');
        // Restaure la position de scroll memorisee pour ne pas perdre la
        // place de l'utilisateur dans la grille.
        main.scrollTop = state.gridScrollY || 0;
      }
    };
    els.productScreen.addEventListener('animationend', finish);
    setTimeout(finish, 300);
  }

  function renderProductPage(app) {
    const tileState = tileStateOf(app);
    const owned = state.licenses[app.id] || app.tier === 'free';
    const installed = !!state.installs[app.id];

    // Icone (image si dispo, sinon initiales)
    const initials = makeInitials(app.name);
    els.productIcon.innerHTML = '';
    if (app.icon) {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', () => {
        els.productIcon.textContent = initials;
      });
      img.src = app.icon;
      els.productIcon.appendChild(img);
    } else {
      els.productIcon.textContent = initials;
    }

    // Tags (memes regles que la tuile pour rester coherent)
    const tags = [];
    if (app.tier === 'free')                          tags.push('<span class="tag tag-free">Gratuit</span>');
    if (state.licenses[app.id])                       tags.push('<span class="tag tag-owned">Adoubé</span>');
    if (app.comingSoon)                               tags.push('<span class="tag tag-soon">En quête</span>');
    if (installed && !app.comingSoon)                 tags.push('<span class="tag tag-installed">À ta Table</span>');
    if (tileState === 'update-available')             tags.push('<span class="tag tag-update">Mise à jour</span>');
    if (app.featured && tileState === 'not-owned') {
      tags.push(`<span class="tag tag-completion">${escapeHtml(app.featuredLabel || 'Populaire')}</span>`);
    }
    els.productTags.innerHTML = tags.join('');

    // Identite
    els.productName.textContent = app.name;
    els.productTagline.textContent = app.tagline || '';

    // Statut texte (caché pour les services : "non acquis" n'a pas de sens
    // pour une offre qu'on contracte par email).
    if (tileState === 'service') {
      els.productStatus.innerHTML = '';
      els.productStatus.classList.add('hidden');
    } else {
      els.productStatus.classList.remove('hidden');
      let statusBits = [];
      if (owned)     statusBits.push('<strong style="color:var(--green)">possédé</strong>');
      else           statusBits.push('non acquis');
      if (installed) statusBits.push('installé');
      if (tileState === 'update-available') statusBits.push('mise à jour disponible');
      els.productStatus.innerHTML = 'Statut : ' + statusBits.join(' · ');
    }

    // Bloc prix (cache si possede ou gratuit)
    els.productPriceBlock.innerHTML = renderPriceBlock(app, owned);
    if (!owned && app.price && state.promoNote) {
      els.productPriceBlock.innerHTML +=
        `<p class="muted small" style="margin-top:6px;">🎟️ ${escapeHtml(state.promoNote)}</p>`;
    }

    // CTA principaux : on reutilise la meme logique que la tuile pour eviter
    // les divergences (un seul endroit ou changer si on ajoute un etat).
    // On retire ensuite le bouton "Infos / En savoir plus" qui serait
    // redondant sur la fiche elle-meme (tu es deja sur la page d'info).
    renderTileActions(els.productActions, app, tileState);
    els.productActions.querySelectorAll('button').forEach(btn => {
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt === 'infos' || txt === 'en savoir plus' || txt === 'voir la fiche') btn.remove();
    });

    // Galerie de screenshots (remplace le placeholder quand l'app a des
    // visuels). On ouvre une lightbox au clic pour zoomer.
    renderProductMedia(app);

    // Description : supporte les paragraphes (separes par \n\n) en creant
    // un <span> par paragraphe. Sinon retombe sur la tagline.
    const rawDesc = app.description || app.tagline || '';
    if (rawDesc.includes('\n\n')) {
      els.productDescription.innerHTML = rawDesc
        .split(/\n\n+/)
        .map(p => `<span class="product-description-para">${escapeHtml(p.trim())}</span>`)
        .join('');
    } else {
      els.productDescription.textContent = rawDesc;
    }

    // Features (supporte 2 formats : string OU { title, detail })
    if (Array.isArray(app.features) && app.features.length) {
      els.productFeatures.innerHTML = app.features.map(f => {
        if (typeof f === 'string') {
          return `<li class="product-feature-simple">${escapeHtml(f)}</li>`;
        }
        const title = escapeHtml(f.title || '');
        const detail = f.detail ? `<span class="product-feature-detail">${escapeHtml(f.detail)}</span>` : '';
        return `<li class="product-feature-rich"><strong>${title}</strong>${detail}</li>`;
      }).join('');
      els.productFeaturesSection.classList.remove('hidden');
    } else {
      els.productFeaturesSection.classList.add('hidden');
    }

    // Personas ("Pour qui ?") — slot dynamique injecte dans la fiche si
    // l'app expose un tableau personas[]. Chaque item : { name, description }.
    renderPersonas(app);

    // Outils inclus (Suite des Heros)
    if (Array.isArray(app.tools) && app.tools.length) {
      els.productToolsTitle.textContent = `Les ${app.tools.length} outils inclus`;
      els.productTools.innerHTML = app.tools.map(t => `
        <div class="product-tool-card">
          <strong>${escapeHtml(t.name)}</strong>
          <span>${escapeHtml(t.tagline || '')}</span>
        </div>
      `).join('');
      els.productToolsSection.classList.remove('hidden');
    } else {
      els.productToolsSection.classList.add('hidden');
    }

    // Liens externes
    if (Array.isArray(app.links) && app.links.length) {
      els.productLinks.innerHTML = app.links.map(l =>
        `<li><a href="#" data-external="${escapeHtml(l.url)}">→ ${escapeHtml(l.label)}</a></li>`
      ).join('');
      els.productLinksSection.classList.remove('hidden');
      els.productLinks.querySelectorAll('[data-external]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const url = link.getAttribute('data-external');
          if (url && window.triskell && window.triskell.openExternal) {
            window.triskell.openExternal(url);
          }
        });
      });
    } else {
      els.productLinksSection.classList.add('hidden');
    }
  }

  // Section "Pour qui ?" : injectee dynamiquement entre les features et les
  // outils si l'app expose `personas: [{ name, description }]`. On la cree
  // a la volee (pas de marqueur HTML dedie) pour ne pas alourdir index.html.
  function renderPersonas(app) {
    let host = document.getElementById('product-personas-section');
    const personas = Array.isArray(app.personas) ? app.personas.filter(p => p && p.name) : [];

    if (personas.length === 0) {
      if (host) host.remove();
      return;
    }

    if (!host) {
      host = document.createElement('section');
      host.id = 'product-personas-section';
      host.className = 'product-section product-personas-section';
      // Inserer apres les features (ou juste avant les outils si pas de features).
      const featuresSection = els.productFeaturesSection;
      const toolsSection = els.productToolsSection;
      const anchor = !featuresSection.classList.contains('hidden') ? featuresSection : toolsSection;
      anchor.parentNode.insertBefore(host, anchor.nextSibling);
    }

    host.innerHTML = `
      <h2 class="product-section-title">Pour qui ?</h2>
      <div class="product-personas-grid">
        ${personas.map(p => `
          <div class="product-persona-card">
            ${p.icon ? `<span class="product-persona-icon" aria-hidden="true">${escapeHtml(p.icon)}</span>` : ''}
            <div>
              <strong class="product-persona-name">${escapeHtml(p.name)}</strong>
              ${p.description ? `<span class="product-persona-desc">${escapeHtml(p.description)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Galerie de screenshots de la fiche produit. Si l'app a un champ
  // `screenshots: [{ src, caption }, ...]`, on remplace le placeholder par
  // une grille thumbnail. Sinon on remet le placeholder par defaut.
  function renderProductMedia(app) {
    const shots = Array.isArray(app.screenshots) ? app.screenshots : [];
    const host = els.productMedia;
    if (shots.length === 0) {
      // Pas de screenshots : on cache complètement la section (au lieu
      // d'afficher un placeholder "Bientôt visibles ici"). Demande Jordan :
      // tant qu'on n'a pas de visuels, on ne montre rien.
      host.classList.remove('product-media-gallery');
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    host.classList.remove('hidden');
    host.classList.add('product-media-gallery');
    host.innerHTML = shots.map((s, i) => `
      <button class="product-screenshot" data-index="${i}" type="button"
              aria-label="${escapeHtml(s.caption || 'Capture decran')}">
        <img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.caption || '')}" loading="lazy" />
        ${s.caption ? `<span class="product-screenshot-caption">${escapeHtml(s.caption)}</span>` : ''}
      </button>
    `).join('');
    host.querySelectorAll('.product-screenshot').forEach(btn => {
      btn.addEventListener('click', () => {
        openLightbox(shots, parseInt(btn.dataset.index, 10));
      });
    });
  }

  // ============================================================================
  // LIGHTBOX (zoom screenshots fiche produit)
  // ============================================================================
  let lightboxState = { shots: [], index: 0 };

  function openLightbox(shots, index) {
    lightboxState = { shots, index: index || 0 };
    let lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.className = 'lightbox';
      lb.innerHTML = `
        <button class="lightbox-close" type="button" aria-label="Fermer">&times;</button>
        <button class="lightbox-prev" type="button" aria-label="Précédent">&larr;</button>
        <button class="lightbox-next" type="button" aria-label="Suivant">&rarr;</button>
        <img class="lightbox-img" alt="" />
        <p class="lightbox-caption"></p>
      `;
      document.body.appendChild(lb);
      lb.addEventListener('click', (e) => {
        if (e.target === lb) closeLightbox();
      });
      lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
      lb.querySelector('.lightbox-prev').addEventListener('click', () => stepLightbox(-1));
      lb.querySelector('.lightbox-next').addEventListener('click', () => stepLightbox(1));
      document.addEventListener('keydown', (e) => {
        if (!document.getElementById('lightbox') || lb.classList.contains('hidden')) return;
        if (e.key === 'Escape')      closeLightbox();
        if (e.key === 'ArrowLeft')   stepLightbox(-1);
        if (e.key === 'ArrowRight')  stepLightbox(1);
      });
    }
    updateLightbox();
    lb.classList.remove('hidden');
  }

  function updateLightbox() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    const s = lightboxState.shots[lightboxState.index];
    if (!s) return;
    lb.querySelector('.lightbox-img').src = s.src;
    lb.querySelector('.lightbox-caption').textContent = s.caption || '';
    const total = lightboxState.shots.length;
    lb.querySelector('.lightbox-prev').style.visibility = total > 1 ? '' : 'hidden';
    lb.querySelector('.lightbox-next').style.visibility = total > 1 ? '' : 'hidden';
  }

  function stepLightbox(delta) {
    const total = lightboxState.shots.length;
    if (total <= 1) return;
    lightboxState.index = (lightboxState.index + delta + total) % total;
    updateLightbox();
  }

  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.classList.add('hidden');
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
    els.modalTitle.textContent = title || '';
    // Si le titre est vide, on cache la barre H2 pour pas laisser un trou.
    els.modalTitle.style.display = title ? '' : 'none';
    if (bodyHtml) {
      els.modalBody.innerHTML = bodyHtml;
    } else {
      els.modalBody.style.whiteSpace = 'pre-line';
      els.modalBody.textContent = body || '';
    }
    els.modalCta.textContent = ctaLabel || 'OK';
    els.modalCta.classList.toggle('outline', ctaKind === 'danger');
    els.modalCta.onclick = onCta || closeModal;
    // Si la modale est en mode "info pure" (pas de vrai callback CTA),
    // les boutons "Fermer" et "OK" font exactement la meme chose : on
    // cache "Fermer" pour eviter le doublon visuel.
    if (els.modalCancel) {
      els.modalCancel.style.display = onCta ? '' : 'none';
    }
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
  // SOUND DESIGN — chant de cor discret via Web Audio API
  // ============================================================================
  // On synthetise un mini "fanfare" 2 notes (Sol4 -> Re5) avec un timbre brass
  // sin+saw + enveloppe ADSR, joue au moment des moments forts (achat, install
  // reussie, etc.). Pas de fichier audio a charger : marche meme offline.
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
    return _audioCtx;
  }

  function playSuccessFanfare() {
    // Respect du toggle telemetrie : si l'utilisateur a coupe les sons (via
    // la pref dediee plus tard), on coupe. Pour l'instant pas de pref dediee
    // donc on joue toujours, mais discret (gain max 0.12).
    if (state.prefs && state.prefs.muteSounds) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { freq: 392.00, start: 0.00, duration: 0.18 }, // Sol4
      { freq: 587.33, start: 0.18, duration: 0.42 }, // Re5
    ];
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    notes.forEach(({ freq, start, duration }) => {
      const t = now + start;
      // Timbre "brass" : oscillateur sinus + sawtooth panche
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = freq;
      const oGain = ctx.createGain();
      oGain.gain.setValueAtTime(0, t);
      oGain.gain.linearRampToValueAtTime(1, t + 0.03);   // attaque rapide
      oGain.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.5); // decay
      oGain.gain.exponentialRampToValueAtTime(0.001, t + duration);    // release
      const mix = ctx.createGain();
      mix.gain.value = 0.7;
      o1.connect(mix);
      const sawAtten = ctx.createGain();
      sawAtten.gain.value = 0.3;
      o2.connect(sawAtten);
      sawAtten.connect(mix);
      mix.connect(oGain);
      oGain.connect(master);
      o1.start(t); o1.stop(t + duration + 0.02);
      o2.start(t); o2.stop(t + duration + 0.02);
    });
  }

  // ============================================================================
  // TOASTS (notifications non-bloquantes)
  // ============================================================================
  function showToast({ kind = 'info', title, message, actionLabel, onAction, timeout = 6000, sound = false }) {
    if (sound && kind === 'success') playSuccessFanfare();
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

  // ============================================================================
  // COMMAND PALETTE — raccourci Ctrl+K (ou Cmd+K)
  // ============================================================================
  // Palette de commandes inspirée de Raycast / Linear / VSCode : on ouvre par
  // raccourci, on tape pour filtrer, flèches pour naviguer, Entrée pour
  // ouvrir la fiche du produit. Indépendante des onglets — cherche dans
  // tout le catalogue.
  let paletteOpen = false;
  let paletteFilter = '';
  let paletteSelectedIndex = 0;

  function paletteResults() {
    const q = paletteFilter;
    const all = state.apps.slice();
    if (!q) return all;
    return all.filter(a => {
      const hay = (a.name + ' ' + (a.tagline || '') + ' ' + (a.description || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  function renderPaletteList() {
    const list = document.getElementById('command-palette-list');
    if (!list) return;
    const items = paletteResults();
    if (items.length === 0) {
      list.innerHTML = '<li class="command-palette-empty">Aucun compagnon ne répond à cet appel.</li>';
      return;
    }
    // Borne l'index pour éviter de pointer hors-liste après filtre
    if (paletteSelectedIndex >= items.length) paletteSelectedIndex = items.length - 1;
    if (paletteSelectedIndex < 0) paletteSelectedIndex = 0;

    list.innerHTML = items.map((app, i) => {
      const isSelected = i === paletteSelectedIndex;
      const cat = (state.categories || []).find(c => c.id === app.category);
      const catLabel = cat?.label || '';
      const initials = makeInitials(app.name);
      const iconHtml = app.icon
        ? `<img src="${escapeHtml(app.icon)}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHtml(initials)}'))" />`
        : escapeHtml(initials);
      return `
        <li class="command-palette-item${isSelected ? ' is-selected' : ''}" data-index="${i}" data-id="${escapeHtml(app.id)}">
          <span class="command-palette-item-icon">${iconHtml}</span>
          <span class="command-palette-item-text">
            <span class="command-palette-item-name">${escapeHtml(app.name)}</span>
            <span class="command-palette-item-tagline">${escapeHtml(app.tagline || '')}</span>
          </span>
          ${catLabel ? `<span class="command-palette-item-cat">${escapeHtml(catLabel)}</span>` : ''}
        </li>
      `;
    }).join('');

    list.querySelectorAll('.command-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const app = state.apps.find(a => a.id === id);
        if (app) { closeCommandPalette(); showProductPage(app); }
      });
      el.addEventListener('mouseenter', () => {
        paletteSelectedIndex = parseInt(el.dataset.index, 10) || 0;
        list.querySelectorAll('.command-palette-item').forEach((e, i) => {
          e.classList.toggle('is-selected', i === paletteSelectedIndex);
        });
      });
    });

    // Auto-scroll de l'item sélectionné dans la viewport de la liste
    const sel = list.querySelector('.command-palette-item.is-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function openCommandPalette() {
    if (paletteOpen) return;
    if (!Array.isArray(state.apps) || state.apps.length === 0) return;
    paletteOpen = true;
    paletteFilter = '';
    paletteSelectedIndex = 0;

    let palette = document.getElementById('command-palette');
    if (!palette) {
      palette = document.createElement('div');
      palette.id = 'command-palette';
      palette.className = 'command-palette';
      palette.innerHTML = `
        <div class="command-palette-backdrop" data-close></div>
        <div class="command-palette-card">
          <div class="command-palette-search">
            <span class="command-palette-icon" aria-hidden="true">⌕</span>
            <input id="command-palette-input" type="text"
                   placeholder="Rechercher un compagnon, un service..."
                   autocomplete="off" spellcheck="false" />
            <kbd class="command-palette-esc">Esc</kbd>
          </div>
          <ul id="command-palette-list" class="command-palette-list"></ul>
          <div class="command-palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
            <span><kbd>↵</kbd> ouvrir</span>
            <span><kbd>Esc</kbd> fermer</span>
          </div>
        </div>
      `;
      document.body.appendChild(palette);
      palette.addEventListener('click', (e) => {
        if (e.target.dataset && 'close' in e.target.dataset) closeCommandPalette();
      });
      const input = palette.querySelector('#command-palette-input');
      input.addEventListener('input', (e) => {
        paletteFilter = e.target.value.trim().toLowerCase();
        paletteSelectedIndex = 0;
        renderPaletteList();
      });
    } else {
      palette.querySelector('#command-palette-input').value = '';
    }
    palette.classList.remove('hidden');
    renderPaletteList();
    setTimeout(() => palette.querySelector('#command-palette-input')?.focus(), 30);
  }

  function closeCommandPalette() {
    if (!paletteOpen) return;
    paletteOpen = false;
    const palette = document.getElementById('command-palette');
    if (palette) palette.classList.add('hidden');
  }

  // Listener global. Ctrl+K (ou Cmd+K sur macOS) ouvre/ferme la palette.
  // Quand la palette est ouverte, on capture aussi flèches/Entrée/Esc.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (paletteOpen) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    if (!paletteOpen) return;
    if (e.key === 'Escape')    { e.preventDefault(); closeCommandPalette(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const len = paletteResults().length;
      paletteSelectedIndex = Math.min(len - 1, paletteSelectedIndex + 1);
      renderPaletteList();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteSelectedIndex = Math.max(0, paletteSelectedIndex - 1);
      renderPaletteList();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = paletteResults();
      const app = items[paletteSelectedIndex];
      if (app) { closeCommandPalette(); showProductPage(app); }
    }
  });
})();
