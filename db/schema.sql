-- Banco da Auronix no Supabase (projeto CDEV Site), isolado no esquema "auronix".
-- O esquema não é exposto pela API do Supabase: só o servidor do site acessa, pela conexão Postgres.
-- Pode rodar de novo sem problema (tudo usa IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS auronix;

CREATE TABLE IF NOT EXISTS auronix.webhook_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key   text NOT NULL UNIQUE,
  event        text NOT NULL,
  order_id     text,
  email        text,
  result       text,
  payload      text NOT NULL,
  is_test      integer NOT NULL DEFAULT 0,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.customers (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email               text NOT NULL UNIQUE,
  name                text,
  phone               text,
  plan_id             text,
  plan_name           text,
  status              text NOT NULL DEFAULT 'ativo',
  last_order_id       text,
  last_offer_id       text,
  last_product_id     text,
  amount              double precision,
  fees                double precision,
  payment_method      text,
  onboarding_token    text UNIQUE,
  onboarding_sent_at  timestamptz,
  is_test             integer NOT NULL DEFAULT 0,
  source              text NOT NULL DEFAULT 'cakto',
  stage               text NOT NULL DEFAULT 'aguardando_onboarding',
  payment_confirmed   integer,
  cost_override       double precision,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.onboardings (
  customer_id   bigint PRIMARY KEY REFERENCES auronix.customers(id) ON DELETE CASCADE,
  answers       text NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.sessions (
  token_hash  text PRIMARY KEY,
  "user"      text NOT NULL,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auronix.emails (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint REFERENCES auronix.customers(id) ON DELETE SET NULL,
  to_email     text NOT NULL,
  subject      text NOT NULL,
  kind         text,
  status       text NOT NULL,
  provider_id  text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.contact_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text,
  company     text,
  message     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.activity (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES auronix.customers(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.contracts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id     bigint NOT NULL REFERENCES auronix.customers(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  version         text NOT NULL,
  title           text NOT NULL,
  body_html       text NOT NULL,
  body_hash       text NOT NULL,
  status          text NOT NULL DEFAULT 'criado',
  sent_at         timestamptz,
  viewed_at       timestamptz,
  accepted_at     timestamptz,
  accepted_name   text,
  accepted_doc    text,
  accepted_email  text,
  accepted_ip     text,
  accepted_ua     text,
  canceled_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auronix.settings (
  key    text PRIMARY KEY,
  value  text NOT NULL
);

CREATE TABLE IF NOT EXISTS auronix.customer_photos (
  customer_id  bigint PRIMARY KEY REFERENCES auronix.customers(id) ON DELETE CASCADE,
  mime         text NOT NULL,
  data         bytea NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Colunas adicionadas depois (db/migrations/002): foto, mapa, perfil do agente e uso de respostas
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS maps_query text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS maps_url text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS agent_profile text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_used integer;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_cycle_start date;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_events_email ON auronix.webhook_events(email);
CREATE INDEX IF NOT EXISTS idx_events_order ON auronix.webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_customer ON auronix.activity(customer_id);
CREATE INDEX IF NOT EXISTS idx_emails_customer ON auronix.emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON auronix.contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_created ON auronix.customers(created_at DESC);

-- Ninguém além do servidor: RLS ligado e sem políticas, e nada liberado para os papéis públicos da API.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'auronix' LOOP
    EXECUTE format('ALTER TABLE auronix.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DO $$
BEGIN
  -- Papéis da API do Supabase (só existem no Supabase)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA auronix FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA auronix FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auronix REVOKE ALL ON TABLES FROM anon, authenticated;
  END IF;
END $$;
