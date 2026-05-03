# Activer le bundle "Compléter ta Table" — étapes manuelles

Le code est prêt et déployé en v0.1.4. Mais le bundle est techniquement
"actif" sans être encore réellement utilisable tant que les **3 prix Stripe
+ les 3 variables Netlify** ne sont pas configurés. Tant que ce n'est pas
fait, un utilisateur qui clique "Compléter ma Table" verra un toast
*"Le pack n'est pas encore activé côté paiement"* — pas de plantage, pas
de paiement échoué.

## 1. Crée 3 prix Stripe (mode Live)

👉 https://dashboard.stripe.com/products

Tu peux soit créer **un seul produit "Pack Table Ronde"** avec **3 prix
distincts**, soit **3 produits séparés**. Les deux marchent.

| Pack            | Prix unique | Description suggérée                           |
|-----------------|-------------|------------------------------------------------|
| Table Ronde — 4 | 89 €        | Tous les outils Triskell d'un coup             |
| Table Ronde — 3 | 69 €        | Les 3 derniers compagnons qui te manquent       |
| Table Ronde — 2 | 49 €        | Les 2 derniers compagnons qui te manquent       |

Pour chaque prix, **note l'ID** (`price_xxxxxxxxxxxxxxxxxxxxxxxx`).

## 2. Configure les 3 variables Netlify

Dans le dossier `backend/` du Lanceur :

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/backend"

netlify env:set STRIPE_BUNDLE_PRICE_4 "price_..."
netlify env:set STRIPE_BUNDLE_PRICE_3 "price_..."
netlify env:set STRIPE_BUNDLE_PRICE_2 "price_..."

netlify deploy --prod
```

## 3. Pointer le webhook Stripe

Dans Stripe Dashboard → Webhooks → Endpoint :

- URL : `https://api.triskell-studio.fr/api/webhook-bundle`
- Événement à écouter : `checkout.session.completed`
- Note le **signing secret** affiché → mets-le dans la variable Netlify
  `STRIPE_BUNDLE_WEBHOOK_SECRET` :

```bash
netlify env:set STRIPE_BUNDLE_WEBHOOK_SECRET "whsec_..."
netlify deploy --prod
```

## 4. Tester

1. Connecte-toi au Lanceur avec un compte qui a **au moins 1 licence**
   (sinon le bundle dynamique n'apparaît pas)
2. Le bundle "Compléter ta Table" doit apparaître au-dessus de la grille
3. Clique → la fenêtre Stripe Checkout doit s'ouvrir maximisée
4. Paie en mode test (carte `4242 4242 4242 4242`) → toutes les licences
   du bundle doivent apparaître chez le user dans les ~5s
