-- Foto do cliente, localização no Google Maps, perfil do agente e controle de respostas usadas.
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS maps_query text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS maps_url text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS agent_profile text;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_used integer;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_cycle_start date;
ALTER TABLE auronix.customers ADD COLUMN IF NOT EXISTS usage_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS auronix.customer_photos (
  customer_id  bigint PRIMARY KEY REFERENCES auronix.customers(id) ON DELETE CASCADE,
  mime         text NOT NULL,
  data         bytea NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auronix.customer_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON auronix.customer_photos FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON auronix.customer_photos TO auronix_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'auronix' AND tablename = 'customer_photos' AND policyname = 'auronix_app_all') THEN
      CREATE POLICY auronix_app_all ON auronix.customer_photos FOR ALL TO auronix_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
