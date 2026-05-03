# La Table Ronde — Triskell Studio

Le lieu où tes outils **Triskell Studio** se réunissent. Une seule application Windows pour découvrir, recruter, installer, convoquer et tenir à jour toute ta suite : Suite des Héros, DéliNote, Le Studio PDF, Bobeez, Pirate Life Mail, et tous les compagnons à venir.

> **Modèle économique** : La Table Ronde est **gratuite** (capture email + remarketing). Chaque compagnon reste vendu séparément sur sa propre landing page. La Table détecte automatiquement ce que l'utilisateur a adoubé via son compte Triskell.

## Architecture en 3 morceaux

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. LA TABLE RONDE (Electron, ce dossier)                            │
│  - app.triskell-studio.fr propose le .exe en téléchargement gratuit  │
│  - Login email + code 6 chiffres                                     │
│  - Tuiles : Convoquer / Installer / Recruter selon les licences      │
│  - Auto-update via electron-updater + GitHub Releases                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. BACKEND (backend/, Netlify Functions + Supabase + Resend)        │
│  - api.triskell-studio.fr                                            │
│  - /api/login + /api/verify   → auth par code email                  │
│  - /api/me                    → liste des licences                   │
│  - /api/install-token         → URL signée pour télécharger un .zip  │
│  - /api/register-license      → reçoit les achats Stripe             │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────────┐
│  3. WEBHOOKS PRODUITS (chaque produit a son tunnel d'achat)          │
│  - Suite des Héros : productivite.triskell-studio.fr (Stripe + ZIP)  │
│  - DéliNote        : delinote.triskell-studio.fr (TBD)               │
│  - Studio PDF      : (à venir)                                       │
│  - Bobeez          : (à venir)                                       │
│  Chaque webhook appelle /api/register-license après un paiement      │
│  pour ajouter la licence au compte Triskell de l'acheteur.           │
└──────────────────────────────────────────────────────────────────────┘
```

## Structure du dépôt

| Dossier | Rôle |
|---------|------|
| `main.js`, `preload.js`, `renderer.js`, `index.html`, `style.css` | App Electron |
| `apps.json` | Catalogue des produits affichés (éditable à chaud) |
| `src/store.js` | Persistance locale (session, installs) |
| `src/installer.js` | Téléchargement + extraction des produits |
| `assets/` | Logo et icônes |
| `backend/` | API Netlify Functions + schéma Supabase |
| `landing/` | Site statique `app.triskell-studio.fr` |

## Lancer en dev

```bash
npm install
npm start
```

Variables d'environnement utiles :
- `TRISKELL_DEV=1` → ouvre les DevTools au démarrage
- `TRISKELL_API_URL=http://localhost:8888` → utilise un backend local au lieu de la prod

## Builder l'installeur

```bash
npm run build
```

Sortie : `dist/Triskell Lanceur Setup x.y.z.exe` (NSIS, x64).

## Mise en production — checklist

Suivre dans cet ordre :

1. **Backend Supabase + Netlify** — voir [`backend/README.md`](backend/README.md)
2. **Domaine `api.triskell-studio.fr`** pointé sur le site Netlify du backend
3. **Webhooks Stripe** modifiés : ajouter `LANCEUR_API_URL` et `LANCEUR_INTERNAL_SECRET` dans les variables d'environnement de chaque webhook produit
4. **Repo GitHub** `Jordan-Bourillot/triskell-lanceur` créé
5. **Premier `npm run build`** → upload manuel du `.exe` dans GitHub Releases v0.1.0
6. **Domaine `app.triskell-studio.fr`** pointé sur le site Netlify de `landing/`
7. **Test bout en bout** : télécharger depuis `app.triskell-studio.fr`, login, voir la tuile Suite des Héros active après achat

## Roadmap après V1

- [ ] Sous-menu in-app pour les 11 outils de la Suite des Héros (au lieu d'ouvrir le dossier)
- [ ] Page "Mon compte" complète (factures Stripe, désabonnement, changer email)
- [ ] Détection auto des `.exe` déjà installés sur la machine
- [ ] Recherche globale dans tous les outils (raccourci global Win+T par ex.)
- [ ] Notifications de nouvelles versions avant l'auto-install
- [ ] Telemetrie opt-in (clics, lancements) via Plausible

## Licence

Propriétaire — Triskell Studio. Tous droits réservés.
