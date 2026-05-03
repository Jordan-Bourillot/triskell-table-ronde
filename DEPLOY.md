# DEPLOY — Mise en production de La Table Ronde

Ce document liste **tout ce qu'il te reste à faire**, dans l'ordre, pour que La Table Ronde tourne en prod.

> **Ce qui est déjà fait** (par Claude Code, automatiquement) :
> - ✅ Code complet (launcher + backend + landing)
> - ✅ Repo Git local initialisé, premier commit fait
> - ✅ Dépendances `npm install` faites pour `Lanceur/` et `backend/`
> - ✅ **Sites Netlify créés** :
>   - `triskell-table-ronde-app` → futur `app.triskell-studio.fr` (landing)
>   - `triskell-table-ronde-api` → futur `api.triskell-studio.fr` (backend)
> - ✅ Dossiers locaux **liés** aux sites Netlify (via `netlify link`)
> - ✅ **8 variables d'env** déjà configurées sur le site backend
> - ✅ **2 variables** ajoutées au site Suite des Héros (pour appeler le backend après chaque achat)
> - ✅ Workflow GitHub Actions prêt — il buildera le `.exe` à chaque tag `v*`
> - ✅ Secrets générés (`JWT_SECRET`, `INTERNAL_SHARED_SECRET`) — sauvegardés dans `backend/.env`

---

## Étape 1 — Créer la base de données Supabase (~5 min)

1. Va sur https://supabase.com → Sign up ou Sign in
2. **New project** :
   - Name : `triskell-table-ronde`
   - Database password : génère-en un et **note-le** (pas critique, on n'en a pas besoin avec la service key)
   - Region : `Europe (Frankfurt)`
   - Plan : **Free**
3. Attends 2 minutes que le projet soit prêt
4. **SQL Editor → New query** : copie-colle tout le contenu du fichier [`backend/schema.sql`](backend/schema.sql) et clique **Run**. Tu dois voir "Success".
5. **Settings → API** : note les 2 valeurs suivantes :
   - **Project URL** (ex : `https://abcdefgh.supabase.co`)
   - **service_role key** (la longue, pas la `anon`) — clique sur "Reveal" pour la voir

## Étape 2 — Ajouter les 3 variables qui restent à Netlify backend (~2 min)

```bash
# Depuis le dossier backend/ (deja link to triskell-table-ronde-api)
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/backend"

netlify env:set SUPABASE_URL "https://TON-PROJET.supabase.co"
netlify env:set SUPABASE_SERVICE_KEY "TA-SERVICE-ROLE-KEY"
netlify env:set RESEND_API_KEY "TA-CLE-RESEND"
```

> 💡 La `RESEND_API_KEY` est la même que celle utilisée pour la Suite des Héros. Récupère-la depuis https://resend.com → API Keys (ou regarde dans tes notes).

## Étape 3 — Déployer le backend (~2 min)

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/backend"
netlify deploy --prod
```

Tu dois voir une URL de prod genre `https://triskell-table-ronde-api.netlify.app`. Test rapide :

```bash
curl -X POST https://triskell-table-ronde-api.netlify.app/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"toi@triskell-studio.fr\"}"
# Doit renvoyer: {"ok":true,"expiresIn":900}
# Et tu dois recevoir un email avec un code 6 chiffres.
```

## Étape 4 — Configurer le DNS chez ton registrar (~3 min)

Chez ton registrar (Gandi / OVH / Cloudflare / etc.), ajoute **2 CNAME** sur `triskell-studio.fr` :

| Sous-domaine | Type   | Valeur                                  |
|--------------|--------|-----------------------------------------|
| `api`        | CNAME  | `triskell-table-ronde-api.netlify.app`      |
| `app`        | CNAME  | `triskell-table-ronde-app.netlify.app`      |

La propagation DNS prend de 5 minutes à 1 heure.

## Étape 5 — Connecter les domaines custom à Netlify (~3 min)

Pour chaque site (`triskell-table-ronde-api` et `triskell-table-ronde-app`) :

1. Netlify Dashboard → ton site → **Domain settings**
2. **Add custom domain** → tape `api.triskell-studio.fr` (resp. `app.triskell-studio.fr`)
3. Netlify détecte le DNS et active **HTTPS automatiquement** (Let's Encrypt)

## Étape 6 — Pousser le repo sur GitHub (~5 min)

1. Va sur https://github.com/new
2. Repository name : `triskell-table-ronde`
3. Visibility : **Private** (mieux pour V1, tu peux le passer en public après)
4. **Ne coche pas** "Add README" (on en a déjà un)
5. Crée le repo

Puis depuis le dossier local :

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur"
git remote add origin https://github.com/Jordan-Bourillot/triskell-table-ronde.git
git branch -M main
git push -u origin main
```

> 💡 Si Git te demande tes identifiants, utilise un **Personal Access Token** (Settings GitHub → Developer settings → Personal access tokens → classic, avec scope `repo`).

## Étape 7 — Publier la première release `.exe` (~5 min)

Le workflow GitHub Actions buildera automatiquement le `.exe` quand tu pousses un tag :

```bash
git tag v0.1.0
git push origin v0.1.0
```

Puis :
1. Va sur https://github.com/Jordan-Bourillot/triskell-table-ronde/actions
2. Tu vois le workflow "Release Triskell Lanceur" tourner (~10-15 minutes)
3. Une fois fini, va dans **Releases** → tu dois voir `v0.1.0` avec le `Triskell Lanceur Setup 0.1.0.exe` attaché

## Étape 8 — Déployer la landing page (~2 min)

Maintenant que la release `.exe` existe, déploie la landing :

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 0 - Lanceur/landing"
netlify deploy --prod
```

Vérifie : `https://app.triskell-studio.fr` doit afficher la landing. Le bouton "Télécharger" doit pointer sur le `.exe` de la release.

## Étape 9 — Re-déployer le webhook Suite des Héros (~2 min)

Les 2 nouvelles variables d'env (`LANCEUR_API_URL`, `LANCEUR_INTERNAL_SECRET`) sont en place côté Netlify, mais les fichiers de code aussi viennent d'être modifiés (cf. [`Triskell 4 - Suite des Heros/landing-pack/netlify/functions/webhook.js`](../Triskell 4 - Suite des Heros/landing-pack/netlify/functions/webhook.js)). Tu dois redéployer :

```bash
cd "C:/Users/jorda/OneDrive/Bureau/Triskell Studio/Triskell 4 - Suite des Heros/landing-pack"
netlify deploy --prod
```

À partir de maintenant, **chaque achat Suite des Héros crée automatiquement un compte Triskell + une licence**.

## Étape 10 — Test bout en bout (~5 min)

1. Sur un autre PC (ou en dé-installant le Lanceur si tu l'as déjà), va sur `https://app.triskell-studio.fr`
2. Clique **Télécharger** → installe le `.exe`
3. Ouvre le Lanceur → entre ton email Triskell → reçois le code → colle-le → connecté
4. Tu dois voir la grille avec 5 tuiles. Si tu as déjà acheté la Suite des Héros, sa tuile doit dire **"Installer"**.
5. Clique **Installer** → ça télécharge le ZIP, l'extrait dans `Documents\Triskell\SuiteDesHeros\`
6. Clique **Lancer** → ça ouvre le dossier d'install (V1) ; tu peux double-cliquer sur n'importe quel `.exe`.

---

## En cas de pépin

| Problème | Solution |
|----------|----------|
| `netlify deploy` échoue | Vérifie que tu es bien connecté : `netlify status` |
| Le code email n'arrive pas | Vérifie `RESEND_API_KEY` et que `triskell-studio.fr` est validé sur Resend |
| `Login` renvoie `server-error` | Vérifie les variables Supabase et que `schema.sql` a bien été exécuté |
| Tuile "Acheter" au lieu de "Installer" | Le `register-license` a échoué côté webhook — regarde les logs Netlify de `productivite.triskell-studio.fr` |
| Le `.exe` se télécharge mais Windows bloque | Normal : c'est SmartScreen. Clique "Informations complémentaires" → "Exécuter quand même" (signature de code = ~200 €/an) |

## Mises à jour suivantes

À chaque nouvelle version :
1. Modifie le code, commit
2. Bump la version dans `package.json` (ex. `0.1.0` → `0.1.1`)
3. `git tag v0.1.1 && git push origin v0.1.1`
4. GitHub Actions build + publie automatiquement
5. Les Lanceurs déjà installés se mettent à jour tout seuls au prochain démarrage (electron-updater)

---

**Temps total estimé** : 30-40 minutes la première fois.

Tu peux le faire d'une traite, ou en plusieurs sessions. Bonne chance !
