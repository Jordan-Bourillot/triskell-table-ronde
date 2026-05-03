-- Schema Supabase pour le backend Triskell Lanceur
-- A copier-coller dans Supabase Dashboard > SQL Editor > New query > Run

-- Comptes Triskell (un par email).
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  created_at    timestamptz default now(),
  last_login_at timestamptz
);

-- Codes de connexion temporaires (6 chiffres, valides 15 min).
-- On stocke un hash pour qu'une fuite de la base ne donne pas les codes.
create table if not exists login_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  attempts    int  default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz default now()
);
create index if not exists login_codes_email_idx on login_codes (email);
create index if not exists login_codes_expires_idx on login_codes (expires_at);

-- Licences detenues par chaque utilisateur.
-- Une ligne = une preuve d'achat = une licence active sur un produit.
create table if not exists licenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade,
  product_key       text not null,                   -- 'suite-des-heros', 'delinote', ...
  stripe_session_id text unique,                     -- 1 paiement = 1 licence
  status            text default 'active',           -- 'active' | 'refunded' | 'revoked'
  purchased_at      timestamptz default now()
);
create index if not exists licenses_user_id_idx on licenses (user_id);
create index if not exists licenses_product_key_idx on licenses (product_key);

-- Interets clients sur les produits qui ne sont pas encore en vente
-- (capture de leads qualifies pour la sortie de chaque tunnel Stripe).
create table if not exists product_interest (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  product_key text not null,
  source      text default 'launcher',
  created_at  timestamptz default now()
);
create unique index if not exists product_interest_user_product_idx
  on product_interest (user_id, product_key);
create index if not exists product_interest_product_idx
  on product_interest (product_key);

-- Pas de RLS : on accede uniquement avec la SERVICE_KEY cote backend.
