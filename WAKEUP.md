# 🌅 Bonjour Jordan — résumé du travail de la nuit

Je suis allé au bout de ce qui était techniquement faisable sans tes accès GitHub
ni ton intervention au DNS. Voilà ce qui est **opérationnel maintenant** et ce
qui reste à faire de ton côté.

---

## ✅ Tout ce qui marche déjà en prod

### 1. La Table Ronde téléchargeable
- **URL publique** : <https://triskell-lanceur-app.netlify.app>
- Bouton **"Télécharger La Table Ronde"** → sert le `.exe` 82 Mo en CDN
- Direct : <https://triskell-lanceur-app.netlify.app/_dl/La-Table-Ronde-Setup.exe>
- L'installeur NSIS s'installe proprement, crée raccourci bureau + menu Démarrer

### 2. Backend complet en prod
- API : <https://triskell-lanceur-api.netlify.app>
- Endpoints OK : `/api/login`, `/api/verify`, `/api/me`, `/api/install-token`,
  `/api/register-license`
- Supabase : 1 user (`contact@triskell-studio.fr`) avec 3 licences actives :
  Suite des Héros, Studio PDF, Bobeez (toutes en mode test pour validation)

### 3. Trois produits installables depuis La Table Ronde
| Produit | CDN | Taille | Type |
|---------|-----|--------|------|
| Suite des Héros | `productivite.triskell-studio.fr/_dl/suite-des-heros.zip` | 89 Mo | zip-bundle (11 outils) |
| **Studio PDF** ⭐ NEW | `productivite.triskell-studio.fr/_dl/studio-pdf-setup.exe` | 118 Mo | exe-installer |
| **Bobeez** ⭐ NEW | `productivite.triskell-studio.fr/_dl/bobeez-setup.exe` | 157 Mo | exe-installer |

### 4. Webhook Suite des Héros
Patché pour appeler `/api/register-license` après chaque achat Stripe → la
licence remonte automatiquement dans le compte Triskell de l'acheteur.

### 5. Test end-to-end validé
Connexion, fetch licences, install token, téléchargement, extraction — tout
testé hier soir sur ton PC. Tu peux re-tester en lançant `npm start` :
les 3 produits doivent apparaître avec **"Adoubé"** + bouton **"Installer"**.

---

## 📋 Ce que tu dois faire (par ordre de priorité)

### 🔴 Bloquant pour la mise en ligne propre

**A. Créer le repo GitHub** (5 min)
- Va sur <https://github.com/new>
- Nom : `triskell-table-ronde`, Private
- Surtout NE COCHE PAS "Add README"
- Puis dans ton terminal :
  ```bash
  cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur"
  git remote add origin https://github.com/Jordan-Bourillot/triskell-table-ronde.git
  git push -u origin main
  ```
- Si Git te demande tes identifiants : génère un Personal Access Token sur
  github.com (Settings → Developer settings → Personal access tokens → classic,
  scope `repo`).

**B. Premier release v0.1.0** (5 min après le push)
- Une fois le code pushé :
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```
- GitHub Actions buildera le `.exe` automatiquement et le publiera sur
  Releases. À ce moment-là, la landing **basculera automatiquement** sur la
  release GitHub (au lieu du fallback Netlify) et **electron-updater** pourra
  servir les futures MAJ.

**C. Configurer le DNS** (5 min chez ton registrar + ~30 min de propagation)

Ajoute 2 CNAME sur `triskell-studio.fr` :

| Sous-domaine | Type | Valeur |
|--------------|------|--------|
| `api` | CNAME | `triskell-lanceur-api.netlify.app` |
| `app` | CNAME | `triskell-lanceur-app.netlify.app` |

Puis dans Netlify Dashboard, sur chacun des 2 sites :
**Domain settings → Add custom domain** → tape l'URL et Netlify active
HTTPS automatiquement (Let's Encrypt).

Une fois en place, change dans `main.js` ligne 28 :
```js
const API_BASE = process.env.TRISKELL_API_URL || 'https://api.triskell-studio.fr';
```
(au lieu de `triskell-lanceur-api.netlify.app`).

### 🟠 Pour vendre Studio PDF + Bobeez

Aujourd'hui ils sont visibles dans La Table Ronde et **téléchargeables une
fois adoubés** (= une licence active dans Supabase). Mais leur bouton
"Recruter" pointe sur `triskell-studio.fr` parce qu'**ils n'ont pas encore
de tunnel Stripe à eux**.

Pour les rendre vendables :
1. Crée un **landing + tunnel Stripe** par produit (peux copier la structure de
   `Triskell 4 - Suite des Heros/landing-pack/`)
2. Remplace dans `apps.json` :
   - `studio-pdf.buyUrl` → `https://studio-pdf.triskell-studio.fr`
   - `bobeez.buyUrl` → `https://bobeez.triskell-studio.fr`
3. Retire `buyUrlPlaceholder: true`
4. Configure le webhook Stripe de chaque produit pour appeler
   `/api/register-license` (variables `LANCEUR_API_URL` + `LANCEUR_INTERNAL_SECRET`,
   déjà documentées dans `webhook.js` de Suite des Héros)

### 🟢 Optionnels (UX raffinement)

- Reprendre les **3 licences de test** dans Supabase quand t'en auras vraiment
  besoin de les retirer (`stripe_session_id` commence par `test-manual-`)
- **Profile sync** : faire pousser le `displayName` du Lanceur dans la table
  `users` Supabase (colonne à ajouter)

---

## 🗂️ État Git

- Branche `main`, **5 commits**, pas pushée (pas de remote pour l'instant)
- Pas de fichier non committé
- Dernier commit : "Bobeez wired up + La Table Ronde installable end-to-end"

```
519147c Bobeez wired up + La Table Ronde installable end-to-end
1e3fa3a Studio PDF wired up + La Table Ronde available for download
35e6e63 Rebrand: Triskell Lanceur -> La Table Ronde
376ab2f Add GitHub Actions workflow + DEPLOY.md + .ico icon
b0be7ab Initial Triskell Lanceur MVP V1
```

## 🔐 Secrets à connaître

Tous déjà configurés sur Netlify (côté serveur), copies aussi dans
`backend/.env` (local, gitignoré) :

- `JWT_SECRET=da5a8df...e72fdbe1`
- `INTERNAL_SHARED_SECRET=8f83ae4...b2a8fdfe81`
- `DOWNLOAD_SIGNING_SECRET=f5862ad...a9af7bf6d88` (partagé avec Suite des Héros)
- `RESEND_API_KEY=re_MUfmaiFZ_NcF...dB`
- `SUPABASE_SERVICE_KEY=sb_secret_15h0XdZ1K2nCHwlazL35Ww_-yLgpTQ8`

## 🎯 Pour que tout soit "vraiment vendable" en V1

Dans l'ordre, après le réveil :

1. ☐ Push GitHub (5 min) → **La Table Ronde existe officiellement**
2. ☐ Tag v0.1.0 (1 min) → **GitHub Actions publie le `.exe`** sur Releases
3. ☐ DNS api + app (5 min + propagation) → **Domaines propres**
4. ☐ Tester un achat Stripe **réel** sur la Suite des Héros pour valider la
     chaîne webhook → register-license → tuile passe à "Adoubé"
5. ☐ Annoncer La Table Ronde 🎉

---

Bon réveil ! Tout ce qui était techniquement bloqué uniquement par mes accès
ou par des questions qui méritaient ton avis est documenté ci-dessus. Pour
le reste j'ai foncé.

— Claude
