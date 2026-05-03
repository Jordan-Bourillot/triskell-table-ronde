# Triskell Lanceur — Backend

API serverless qui gère :
- les **comptes Triskell** (login par code email à 6 chiffres)
- les **licences** (qui possède quoi)
- les **tokens d'install** (téléchargement sécurisé des produits depuis le Lanceur)

Hébergé sur **Netlify Functions**, base de données sur **Supabase** (gratuit), emails via **Resend**.

## Routes

| Méthode | Chemin | Rôle |
|---------|--------|------|
| POST    | `/api/login`         | Envoie un code 6 chiffres à l'email |
| POST    | `/api/verify`        | Vérifie le code, renvoie un JWT de session |
| GET     | `/api/me`            | (à venir) Renvoie le user + ses licences |
| GET     | `/api/install-token` | (à venir) Lien temporaire pour télécharger un produit |
| POST    | `/api/stripe-webhook`| (à venir) Reçoit les paiements Stripe et crée les licences |

## Setup en 5 étapes

### 1. Supabase (~5 min)
1. Créer un compte sur [supabase.com](https://supabase.com), créer un nouveau projet (région : Frankfurt).
2. Aller dans **SQL Editor → New query**, coller le contenu de `schema.sql`, cliquer **Run**.
3. Settings → API → noter **Project URL** et **service_role key** (la clé `service_role`, **pas** la `anon`).

### 2. Resend (~3 min)
1. Compte sur [resend.com](https://resend.com).
2. Vérifier le domaine `triskell-studio.fr` (3 records DNS — déjà fait pour la Suite des Héros, on réutilise).
3. Récupérer la clé API `re_…`.

### 3. Netlify (~3 min)
1. `npm install -g netlify-cli` (si pas déjà fait).
2. Depuis ce dossier `backend/` : `netlify init` → suivre l'assistant pour créer un nouveau site.
3. Configurer le sous-domaine `api.triskell-studio.fr` (Netlify → Domain → Add custom domain).

### 4. Variables d'environnement
Copier `.env.example` en `.env` localement (pour `netlify dev`) **et** ajouter les mêmes valeurs dans Netlify Dashboard → Site settings → Environment variables.

```
SUPABASE_URL                 https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY         eyJhbGci…
RESEND_API_KEY               re_…
FROM_EMAIL                   login@triskell-studio.fr
REPLY_TO_EMAIL               contact@triskell-studio.fr
JWT_SECRET                   <openssl rand -hex 32>
PUBLIC_URL                   https://api.triskell-studio.fr
```

### 5. Déploiement
```bash
npm install
netlify deploy --prod
```

## Test rapide

```bash
# 1. Demander un code
curl -X POST https://api.triskell-studio.fr/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"toi@triskell-studio.fr"}'

# 2. Récupérer le code dans ta boîte mail, puis :
curl -X POST https://api.triskell-studio.fr/api/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"toi@triskell-studio.fr","code":"123456"}'

# Réponse : { "token": "eyJ…", "user": { "id": "…", "email": "…" } }
```

## Sécurité

- Codes 6 chiffres **stockés hachés** (SHA-256) — fuite de DB ≠ fuite de codes.
- **Rate limit** : 5 demandes de code par heure et par email.
- **Max 5 essais** par code, puis on l'invalide.
- Validité du code : **15 minutes**.
- JWT de session : **30 jours**, signé HS256 avec `JWT_SECRET`.
- Toutes les écritures en base passent par la clé `service_role` côté serveur uniquement.
