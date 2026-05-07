# Landing triskell-studio.fr (apex)

Page statique qui présente **La Table Ronde** (le hub Triskell Studio) et propose son téléchargement.

## Stack

- HTML / CSS / JS vanilla (zéro framework, zéro dépendance)
- Hébergement : **Netlify** (gratuit, déploiement par drag-and-drop ou Git)
- Le bouton "Télécharger" résout dynamiquement la dernière release GitHub via l'API publique

## Déploiement

### Option 1 — drag-and-drop (le plus rapide)
1. Compte sur [netlify.com](https://netlify.com).
2. Drag-and-drop ce dossier `landing/` sur le dashboard.
3. Domain → Add custom domain → `triskell-studio.fr` (primary) + `app.triskell-studio.fr` (alias, redirige auto vers le primary).
4. Configurer le CNAME chez ton registrar de domaine.

### Option 2 — déploiement automatique depuis Git
1. Push ce dossier sur GitHub.
2. Netlify → New site from Git → choisir le repo.
3. Build directory : `landing/`. Pas de commande de build (site statique).

## Capture d'écran

Pour remplacer le placeholder visuel :
1. Lance le Lanceur, fais une belle capture d'écran (1280x800).
2. Place-la dans `assets/screenshot.png`.
3. La page la chargera automatiquement.

## Liens à vérifier

- Bouton télécharger → résout vers le dernier `.exe` publié sur
  `github.com/Jordan-Bourillot/triskell-lanceur/releases/latest`
- Footer → `sites.triskell-studio.fr` (Studio = activité création de sites, sous-domaine)

## Modifier le contenu

Tout est dans `index.html` — pas de framework, pas de build. Tu modifies, tu sauvegardes, Netlify redéploie.
