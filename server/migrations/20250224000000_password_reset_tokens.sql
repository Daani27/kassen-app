-- Für bestehende Installationen: Tabelle für Passwort-Zurücksetzen anlegen.
-- Einmalig ausführen: psql -U kasse_app -d kasse_db -f server/migrations/20250224000000_password_reset_tokens.sql

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token text NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (token),
  CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);
