-- Private account workspaces. Existing shared data remains quarantined until an
-- explicitly identified, email-verified owner is assigned by an administrator.
CREATE SCHEMA IF NOT EXISTS cutsheet_private;
REVOKE ALL ON SCHEMA cutsheet_private FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cutsheet_app') THEN
  CREATE ROLE cutsheet_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT cutsheet_app TO postgres;
GRANT USAGE ON SCHEMA cutsheet_private, auth TO cutsheet_app;
CREATE TABLE IF NOT EXISTS cutsheet_private.accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), email text NOT NULL,
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cutsheet_private.workspaces (
 owner_id uuid PRIMARY KEY REFERENCES cutsheet_private.accounts(user_id),
 data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cutsheet_private.signup_approvals (
 email text PRIMARY KEY, expires_at timestamptz NOT NULL,
 claimed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS cutsheet_private.attempts (
 key text PRIMARY KEY, count integer NOT NULL, until_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cutsheet_private.pairings (
 code_hash text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES cutsheet_private.accounts(user_id),
 expires_at timestamptz NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA cutsheet_private FROM PUBLIC,anon,authenticated,cutsheet_app;
ALTER TABLE cutsheet_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutsheet_private.signup_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutsheet_private.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutsheet_private.pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutsheet_private.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutsheet_private.workspaces FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON cutsheet_private.workspaces TO cutsheet_app;
DROP POLICY IF EXISTS account_isolation ON cutsheet_private.workspaces;
CREATE POLICY account_isolation ON cutsheet_private.workspaces FOR ALL TO cutsheet_app
 USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));
DO $$ BEGIN
 IF to_regclass('public.cutsheet_workshop') IS NOT NULL THEN
  ALTER TABLE public.cutsheet_workshop ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.cutsheet_workshop FROM PUBLIC,anon,authenticated,cutsheet_app;
 END IF;
END $$;
