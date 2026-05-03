# Triskell Lanceur — Ce qui est prêt et ce qui reste

État au 2026-05-03, après la session de nuit.

## ✅ Livré et opérationnel

### Identité Table Ronde
- Logo triskèle 3 pales (sans texte) sur le login + le header
- Couleurs Triskell Studio (indigo, violet, orange) + accent or pour les titres nobles
- Vrais logos d'apps (cape Suite des Héros, lion DéliNote, blaireau Bertrand, ours Pirate Life Mail, coccinelle Bobeez)
- Vocabulaire de quête : Adoubé, À ta Table, En quête, Recruter, Maître Trieur…
- Typographie noble (serif) sur les titres, lettrine dorée sur les `<h1>`
- Numéro de version v0.1.0 visible en pastille à côté du brand
- Badge "🟢 [email]" dans le header
- Bandeau d'accueil personnalisé : salutation, raccourcis "Récents", compteur licences/installs
- Tri intelligent des tuiles : "À jour" et "Adoubé" remontent, "En quête" en bas

### Catalogue & prix
- 5 produits : Suite des Héros (27€/39€), DéliNote (29€), Studio PDF (39€), Bobeez (TBD), Pirate Life Mail (gratuit)
- Prix sur tuile avec barré + note "Paiement unique · à vie"
- Modale "Infos" enrichie : statut, prix, mention code promo, liste des outils inclus, bouton Désinstaller

### Bundle dynamique "Compléter ta Table"
- Carte adaptative qui s'auto-calcule selon ce que le user possède :
  - 4 manquants → 89 € au lieu de 130 €
  - 3 manquants → 69 € au lieu de 100 €
  - 2 manquants → 49 € au lieu de 65 €
- Affiche les noms des apps manquantes
- Marquée "Bientôt" en attendant la config Stripe (voir plus bas)

### Auto-update Lanceur
- electron-updater branché sur GitHub Releases
- Check automatique au boot + toutes les 4h
- Bouton "Vérifier les mises à jour" dans le menu compte
- Statut live (downloading %, prêt, à jour)
- Auto-install à la prochaine fermeture si refus du redémarrage immédiat

### Auto-update produits
- Endpoint backend `/api/versions` qui expose les versions à jour
- Tag orange "Mise à jour" sur la tuile si version locale ≠ distante
- Bouton "Mettre à jour" qui ré-installe

### Mode hors-ligne
- Cache local des licences (`licenses-cache.json`)
- Fallback si réseau down → bandeau "📡 Mode hors-ligne"
- Les outils déjà installés restent lançables

### UX produits
- Sous-menu d'outils (Suite des Héros) : grille des 11 outils, chacun lance son `.exe`
- Achat in-app : Stripe Checkout dans une fenêtre Electron, retour licence auto sans redémarrage
- Notifications Windows natives à la fin de chaque install
- Toggles : auto-launch Windows, télémétrie anonyme opt-in, prénom personnalisé
- Toasts non-bloquants au lieu de modales (succès/erreur en bas-droite)

### Auth
- Bypass rate-limit pour `contact@triskell-studio.fr` (env Netlify `LOGIN_BYPASS_EMAILS`)
- Rate limit standard relâché à 20/h (vs 5/h avant)
- JWT 30 jours
- `app.setName('Triskell Lanceur')` force le path `userData` stable peu importe les rebrands

## 🔧 Action côté toi pour activer le bundle

Tout est codé, il manque juste la config Stripe + un déploiement. Quand tu te lèves :

### 1. Créer 3 prix Stripe (Dashboard Stripe → Produits)
Crée 3 produits Stripe (ou 1 produit avec 3 prix) :
- "Pack Table Ronde — Complet (4 outils)" → prix unique 89 € → note l'ID `price_xxx`
- "Pack Table Ronde — 3 outils" → 69 € → note l'ID
- "Pack Table Ronde — 2 outils" → 49 € → note l'ID

### 2. Configurer Netlify (backend Lanceur)
```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/backend"

netlify env:set STRIPE_BUNDLE_PRICE_4 "price_..."
netlify env:set STRIPE_BUNDLE_PRICE_3 "price_..."
netlify env:set STRIPE_BUNDLE_PRICE_2 "price_..."
netlify env:set LANCEUR_APP_URL "https://app.triskell-studio.fr"

# Si pas déjà fait :
netlify env:set STRIPE_SECRET_KEY "sk_live_..."
netlify env:set STRIPE_WEBHOOK_SECRET "whsec_..."

netlify deploy --prod
```

### 3. Pointer le webhook Stripe
Dans Stripe Dashboard → Webhooks → Endpoint :
- URL : `https://triskell-lanceur-api.netlify.app/api/webhook-bundle`
- Événement : `checkout.session.completed`
- Note le signing secret → mets-le dans `STRIPE_WEBHOOK_SECRET`

### 4. Activer le bundle côté UI
Dans [apps.json](apps.json), passe `completionBundle.comingSoon` de `true` à `false`. Bump `package.json` version → `git tag v0.2.0 && git push origin v0.2.0` → tous les Lanceurs installés se mettent à jour seuls.

## 📦 Stripe price IDs des produits single (à créer aussi)

Pour que l'achat in-app marche pour les produits seuls, tu as déjà :
- Suite des Héros : `productivite.triskell-studio.fr` (en place)
- DéliNote : `delinote.triskell-studio.fr` (à créer si pas fait)
- Studio PDF : pas de tunnel encore — il faut une landing
- Bobeez : pas de tunnel encore — il faut une landing

Tant que pas de tunnel pour un produit, sa tuile reste en "En quête".

## 🎨 Polish à faire (si envie)

- Une couronne ou anneau d'or animé autour du logo principal
- Sound design discret pour les toasts (chant de cor)
- Cinzel comme police pour vraiment renforcer le côté médiéval (downloader le woff2 dans `assets/fonts/`)
- Empty state plus narratif quand 0 outils

## 🚀 Workflow de release récurrent

À chaque modif que tu veux pousser à tous les Lanceurs installés :

```bash
# 1. Bump la version
# Edite package.json : "version": "0.2.0" -> "0.2.1"

# 2. Commit + tag
git add -A && git commit -m "Description"
git tag v0.2.1
git push origin main
git push origin v0.2.1

# 3. GitHub Actions build + publie l'installeur sur Releases
# 4. Tous les Lanceurs installés mettront à jour au prochain démarrage
```
