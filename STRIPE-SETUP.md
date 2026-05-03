# Setup Stripe pour le Lanceur — guide unique

Ce qu'il te reste à faire pour activer pleinement v0.1.4. **20 minutes
chrono** au total. Suis dans l'ordre.

> Toutes les étapes Stripe ci-dessous se font en **mode Live** (toggle
> en haut à droite du dashboard Stripe).

---

## 1. Créer les 3 prix du bundle (5 min)

👉 https://dashboard.stripe.com/products → bouton **+ Ajouter un produit**

Crée **3 produits** (ou 1 produit avec 3 prix, comme tu préfères) :

| Nom du produit                | Prix (paiement unique, EUR) |
|-------------------------------|-----------------------------|
| Pack Table Ronde — 4 outils   | 89 €                        |
| Pack Table Ronde — 3 outils   | 69 €                        |
| Pack Table Ronde — 2 outils   | 49 €                        |

Pour chacun, après création, **copie l'ID du prix** (commence par
`price_`, visible sur la page du produit, encadré "Tarifs" → clic sur
le prix → ID en haut).

Tu auras 3 IDs : `P4` (89 €), `P3` (69 €), `P2` (49 €).

---

## 2. Activer le Customer Portal Stripe (1 min)

👉 https://dashboard.stripe.com/settings/billing/portal

- Active le portail (toggle en haut)
- Coche au moins :
  - ☑️ Téléchargement de factures
  - ☑️ Historique des paiements
- En bas : **Lien de retour** = `https://triskell-studio.fr`
- Enregistre

---

## 3. Créer le webhook du bundle (3 min)

👉 https://dashboard.stripe.com/webhooks → **+ Ajouter un point de terminaison**

- **URL** : `https://api.triskell-studio.fr/api/webhook-bundle`
- **Événement à écouter** : `checkout.session.completed`
- Clique **Créer**
- Sur la page du webhook qui s'ouvre, clique **Révéler** à côté de
  "Signing secret". Copie la valeur (commence par `whsec_`).

---

## 4. Pousser les 5 valeurs sur Netlify (1 min)

Garde sous la main :
- Ta clé secrète Stripe (`sk_live_...`) — tu peux la retrouver sur
  https://dashboard.stripe.com/apikeys
- Les 3 price IDs (`price_...`)
- Le webhook signing secret (`whsec_...`)

Puis lance :

```bash
bash "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/scripts/setup-stripe.sh"
```

Le script te demande chaque valeur, configure Netlify, et redéploie. Fini.

---

## 5. (Optionnel) Sentry pour catcher les bugs en prod (3 min)

👉 https://sentry.io/signup → projet "Lanceur Triskell"

Récupère le DSN (`https://xxxx@xxxx.ingest.sentry.io/xxxx`) puis :

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/backend"
netlify env:set SENTRY_DSN "https://...@...ingest.sentry.io/..."
netlify deploy --prod --no-build
```

Le code Sentry est déjà branché (main process Electron + Netlify
functions), il va capturer toutes les exceptions silencieuses dès que
la variable est définie.

---

## Ce que je suis allé poser pour toi

- ✅ `LANCEUR_APP_URL` = `https://triskell-studio.fr` (déjà configuré sur
  Netlify avec `netlify env:set`)
- ✅ Code complet pour `customer-portal.js`, `create-completion-checkout.js`,
  `webhook-bundle.js` (déjà en prod en v0.1.4)
- ✅ `BUNDLE-SETUP.md` (le doc précédent, plus détaillé sur le bundle)
- ✅ `scripts/setup-stripe.sh` (le script tout-en-un de l'étape 4)
