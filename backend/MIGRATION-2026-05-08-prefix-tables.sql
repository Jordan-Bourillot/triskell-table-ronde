-- Migration : prefixer les tables Triskell Lanceur en `lanceur_*`.
--
-- Contexte : la Supabase `rmaafrrseafghptlsgdz` est partagee avec
-- d'autres modules Triskell (Le Phare = `phare_*` et un module
-- collaboratif qui possede deja `public.users` avec un schema
-- different — colonnes `user_id, display_name, color`).
-- Du coup le backend Triskell Lanceur ne pouvait plus rien faire avec
-- la table `users` historique. On migre en `lanceur_*`.
--
-- A executer une seule fois dans Supabase Dashboard > SQL Editor :
--   https://supabase.com/dashboard/project/rmaafrrseafghptlsgdz/sql/new
-- Coller tout le contenu et cliquer "Run".
--
-- Idempotent (toutes les commandes utilisent `if not exists`), donc
-- safe a re-rejouer.

-- Comptes Triskell Lanceur (un par email).
create table if not exists lanceur_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  created_at    timestamptz default now(),
  last_login_at timestamptz
);

-- Codes de connexion temporaires (6 chiffres, valides 15 min).
create table if not exists lanceur_login_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  attempts    int  default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz default now()
);
create index if not exists lanceur_login_codes_email_idx on lanceur_login_codes (email);
create index if not exists lanceur_login_codes_expires_idx on lanceur_login_codes (expires_at);

-- Licences detenues par chaque utilisateur.
create table if not exists lanceur_licenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references lanceur_users(id) on delete cascade,
  product_key       text not null,
  stripe_session_id text unique,
  status            text default 'active',
  purchased_at      timestamptz default now()
);
create index if not exists lanceur_licenses_user_id_idx on lanceur_licenses (user_id);
create index if not exists lanceur_licenses_product_key_idx on lanceur_licenses (product_key);

-- Interets clients sur les produits qui ne sont pas encore en vente.
create table if not exists lanceur_product_interest (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references lanceur_users(id) on delete cascade,
  product_key text not null,
  source      text default 'launcher',
  created_at  timestamptz default now()
);
create unique index if not exists lanceur_product_interest_user_product_idx
  on lanceur_product_interest (user_id, product_key);
create index if not exists lanceur_product_interest_product_idx
  on lanceur_product_interest (product_key);

-- Force PostgREST a recharger le cache du schema (sinon il faut attendre
-- jusqu'a 60s ou faire une autre modif schema).
notify pgrst, 'reload schema';
