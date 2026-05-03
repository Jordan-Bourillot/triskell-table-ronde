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
    toasts:          $('toasts'),
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
  init().catch(err => showFatalError(err.message));

  async function init() {
    bindModal();
    bindProductPage();
    bindInstallProgress();
    bindUpdateStatus();
    bindPurchaseCompleted();

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

    const cat = await window.triskell.getApps();
    if (cat.error) {
      showFatalError('Catalogue introuvable : ' + cat.error);
      return;
    }
    state.apps = cat.apps || [];
    state.bundles = cat.bundles || [];
    state.completionBundle = cat.completionBundle || null;
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
        <div style="display:flex;align-items:center;gap:14px;margin:-6px 0 20px;">
          <img src="assets/triskell_mark.png" alt="Triskell" style="width:52px;height:52px;border-radius:12px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <h2 style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:0.3px;">Mon compte Triskell</h2>
            <p class="muted small" style="margin:2px 0 0;">Table Ronde ${escapeHtml(version)}</p>
          </div>
        </div>
        <p style="text-align:center;color:var(--text);margin:0 0 6px;">Connecté avec <strong style="color:var(--triskell-violet);">${escapeHtml(state.user.email)}</strong></p>
        <p class="muted" style="text-align:center;">Tu possèdes <strong style="color:var(--text);">${Object.keys(state.licenses).length}</strong> licence${Object.keys(state.licenses).length > 1 ? 's' : ''}.</p>

        ${statsHtml}

        <div class="account-section profile-section">
          <label class="profile-field">
            <span class="profile-label">Comment veux-tu que je t'appelle ?</span>
            <input type="text" id="pref-display-name" class="profile-input"
                   maxlength="40" placeholder="Jordan, Maître Trieur, Compagnon…"
                   value="${escapeHtml(displayName)}" />
            <span class="profile-saved muted small hidden" id="pref-display-name-saved">Enregistré ✓</span>
          </label>
          <p class="muted small profile-hint">Apparaîtra dans le bandeau d'accueil ("Salut <span id="profile-preview">${escapeHtml(displayName || 'Compagnon')}</span> 👋"). Laisse vide pour rester anonyme.</p>
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
            // Repeint le bandeau pour reflechir la salutation immediatement
            renderHomeBanner();
          }
        }, 500);
      });
    }
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

    // Si une fiche produit est actuellement affichee, on la repaint aussi
    // pour que les CTA suivent l'etat (achat, install termine, etc.).
    if (state.openProductId) {
      const openApp = state.apps.find(a => a.id === state.openProductId);
      if (openApp) renderProductPage(openApp);
      else hideProductPage();
    }
  }

  function filteredApps() {
    const q = (state.searchQuery || '').toLowerCase();
    let list = q
      ? state.apps.filter(a => {
          const hay = (a.name + ' ' + (a.tagline || '')).toLowerCase();
          return hay.includes(q);
        })
      : state.apps.slice();
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
    if (s === 'coming-soon')         return 5;   // bottom
    return 6;
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

    // Onboarding : bandeau extra pour les nouveaux comptes (0 licence + 0 install)
    renderOnboardingHint(ownedCount, installedCount);
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
      if (featured) onInfo(featured);
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

  // Liste des apps payantes manquantes (premium, non possedees, non gratuites).
  // Sert de base au bundle dynamique "Compléter ta Table".
  function missingPremiumApps() {
    return state.apps.filter(a =>
      a.tier === 'premium'
      && !state.licenses[a.id]
    );
  }

  // Bundles : cartes pleine-largeur au-dessus de la grille produit.
  // Il y a deux sources : (1) les bundles statiques de apps.json (cartes
  // figees, ex. campagnes saisonnieres) ; (2) le completionBundle dynamique
  // qui s'adapte a ce que l'utilisateur possede deja.
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

  // Carte dynamique "Compléter ta Table" : pricing par tier base sur le nombre
  // d'apps qu'il manque a l'utilisateur (4/3/2). Sous 2 manquants, on cache
  // (autant acheter en individuel). A 0 manquant (collection complete), on
  // cache aussi.
  function renderCompletionBundle(host) {
    const cb = state.completionBundle;
    if (!cb || !cb.tiers) return;

    const missing = missingPremiumApps();
    const count = missing.length;
    if (count < 2) return;

    const tier = cb.tiers[String(count)];
    if (!tier) return;

    // Calcul DYNAMIQUE du prix de reference : on additionne les prix des
    // apps que l'utilisateur n'a pas encore. Ca donne la vraie economie en
    // fonction de SA config (et pas un chiffre marketing arbitraire).
    const actualOriginal = missing.reduce((s, a) => s + (a.price || 0), 0);
    const savings = actualOriginal - tier.price;

    // Si le bundle revient plus cher (cas rare avec des apps a faible prix
    // par ex. Suite + Bobeez = 54€ < bundle 55€), on ne montre pas le bundle.
    if (savings <= 0) return;

    const card = document.createElement('article');
    card.className = 'bundle-card bundle-completion' + (cb.comingSoon ? ' bundle-soon' : '');

    // Pourcentage d'economie pour highlight visuel
    const savingsPercent = Math.round((savings / actualOriginal) * 100);

    const original = `<span class="price-old">${actualOriginal} €</span>`;
    const dynamicNote = `Économise ${savings} € (-${savingsPercent} %) par rapport aux achats séparés`;
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
        <p class="bundle-tagline">${escapeHtml(cb.tagline || '')}</p>
        <p class="bundle-missing muted small">Il te manque : <strong>${escapeHtml(missingNames)}</strong></p>
        <div class="bundle-price">
          <span class="price-current">${tier.price} €</span>
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
      actions.appendChild(makeBtn('Compléter ma Table', 'btn-buy',
        async () => {
          const r = await window.triskell.purchase.openCompletion(count, missing.map(a => a.id));
          if (r && !r.ok) {
            // Erreurs cote backend (Stripe pas encore configure, etc.)
            const msg = r.error === 'tier-not-configured' || r.error === 'stripe-not-configured'
              ? 'Le pack n\'est pas encore activé côté paiement. Notre équipe est prévenue, on revient vers toi vite.'
              : 'Impossible de lancer le paiement. Réessaie dans un instant.';
            showToast({ kind: 'error', title: 'Compléter ma Table', message: msg, timeout: 8000 });
          }
        }));
    }
    host.appendChild(card);
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
    const tileState = tileStateOf(app);
    const initials = makeInitials(app.name);

    // Classes d'etat utilisees par le CSS pour donner une hierarchie visuelle
    // (Adoube/Installé/Coming-soon/Featured ont des styles distincts).
    const stateClass = `is-${tileState}`;
    const featuredClass = app.featured && tileState === 'not-owned' ? ' is-featured' : '';
    tile.className = `tile ${stateClass}${featuredClass}`;
    tile.dataset.id = app.id;

    const tags = [];
    if (app.tier === 'free')                                     tags.push('<span class="tag tag-free">Gratuit</span>');
    if (state.licenses[app.id])                                  tags.push('<span class="tag tag-owned">Adoubé</span>');
    if (app.comingSoon)                                          tags.push('<span class="tag tag-soon">En quête</span>');
    if (state.installs[app.id] && !app.comingSoon)               tags.push('<span class="tag tag-installed">À ta Table</span>');
    if (tileStateOf(app) === 'update-available')                 tags.push('<span class="tag tag-update">Mise à jour</span>');

    const ownedAlready = state.licenses[app.id];
    const priceHtml = renderPriceBlock(app, ownedAlready);

    const featuredRibbon = (app.featured && tileState === 'not-owned')
      ? `<span class="tile-ribbon">${escapeHtml(app.featuredLabel || 'Populaire')}</span>`
      : '';

    // Indice de cliquabilite : revele au hover (CSS), masque sur coming-soon.
    // aria-hidden car c'est un signal purement visuel — la tuile entiere est
    // deja cliquable et le screen reader n'a pas besoin de cette redondance.
    // Indice top-droite discret : juste une fleche, masque sur coming-soon
    // et sur les tuiles featured (le ribbon "Populaire" prend deja le coin).
    const hintHtml = (app.comingSoon || (app.featured && tileState === 'not-owned'))
      ? ''
      : '<span class="tile-hint" aria-hidden="true" title="Voir la fiche">&rarr;</span>';

    tile.innerHTML = `
      ${featuredRibbon}
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
        host.appendChild(makeBtn('Infos', 'btn-info', () => onInfo(app)));
        break;
      }
      case 'not-owned':
      default: {
        // Tunnel Stripe pas encore en place : on capture l'interet au lieu
        // d'envoyer le user vers une landing placeholder qui le perdra.
        if (app.buyUrlPlaceholder || app.pendingTunnel) {
          host.appendChild(makeBtn('M\'intéresser', 'btn-buy',
            () => onInterest(app)));
        } else if (app.buyUrl) {
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

    const uninstallBtn = installed
      ? `<button class="ghost-btn" id="uninstall-btn" style="margin-top:18px;color:var(--danger);border-color:var(--danger);">Désinstaller</button>`
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

    // Statut texte
    let statusBits = [];
    if (owned)     statusBits.push('<strong style="color:var(--green)">possédé</strong>');
    else           statusBits.push('non acquis');
    if (installed) statusBits.push('installé');
    if (tileState === 'update-available') statusBits.push('mise à jour disponible');
    els.productStatus.innerHTML = 'Statut : ' + statusBits.join(' · ');

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
      if (txt === 'infos' || txt === 'en savoir plus') btn.remove();
    });

    // Galerie de screenshots (remplace le placeholder quand l'app a des
    // visuels). On ouvre une lightbox au clic pour zoomer.
    renderProductMedia(app);

    // Description
    els.productDescription.textContent = app.description || app.tagline || '';

    // Features
    if (Array.isArray(app.features) && app.features.length) {
      els.productFeatures.innerHTML = app.features
        .map(f => `<li>${escapeHtml(f)}</li>`).join('');
      els.productFeaturesSection.classList.remove('hidden');
    } else {
      els.productFeaturesSection.classList.add('hidden');
    }

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

  // Galerie de screenshots de la fiche produit. Si l'app a un champ
  // `screenshots: [{ src, caption }, ...]`, on remplace le placeholder par
  // une grille thumbnail. Sinon on remet le placeholder par defaut.
  function renderProductMedia(app) {
    const shots = Array.isArray(app.screenshots) ? app.screenshots : [];
    const host = els.productMedia;
    if (shots.length === 0) {
      host.classList.remove('product-media-gallery');
      host.innerHTML = `
        <div class="product-media-empty">
          <span class="product-media-icon" aria-hidden="true">&#x1F4F8;</span>
          <p class="product-media-title">Captures d'écran</p>
          <p class="muted small">Bientôt visibles ici — on prépare les visuels.</p>
        </div>`;
      return;
    }
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
})();
