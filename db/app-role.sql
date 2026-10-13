-- Usuário de banco do site da Auronix: só lê e grava no esquema "auronix".
-- Não acessa as tabelas do CDEV Site (esquema public) nem cria esquemas.
-- A senha é definida à parte:  ALTER ROLE auronix_app PASSWORD '...';
-- Conexão pelo pooler do Supabase: usuário "auronix_app.<project-ref>".

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auronix_app') THEN
    CREATE ROLE auronix_app LOGIN NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA auronix TO auronix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auronix TO auronix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auronix TO auronix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auronix GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auronix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auronix GRANT USAGE, SELECT ON SEQUENCES TO auronix_app;

-- RLS continua ligado: só este usuário tem política liberada. anon e authenticated seguem sem acesso.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'auronix' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'auronix' AND tablename = t AND policyname = 'auronix_app_all') THEN
      EXECUTE format('CREATE POLICY auronix_app_all ON auronix.%I FOR ALL TO auronix_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
