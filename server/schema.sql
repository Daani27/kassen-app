-- Schema für Kasse-App mit eigener Datenbank (ohne Supabase).
-- Voraussetzung: PostgreSQL mit uuid-ossp (oder gen_random_uuid() ab PG13).
-- FKs von auth.users werden durch public.users ersetzt (Login-Accounts).

-- 1) Benutzer für Login (E-Mail + Passwort)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
);

-- 2) Profile (Anzeigename, Admin-Flag). id = users.id bei Registrierten; Gäste haben nur Profile.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  username text,
  is_admin boolean DEFAULT false,
  updated_at timestamp with time zone,
  last_app_version text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- 2b) Passwort-Zurücksetzen (Token mit Ablauf für "Passwort vergessen")
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token text NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (token),
  CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);

-- 3) App-Einstellungen
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text NOT NULL,
  value_bool boolean DEFAULT true,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);

-- 4) Produkte (Strichliste)
CREATE TABLE IF NOT EXISTS public.products (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- 5) Transaktionen (Kontobewegungen)
CREATE TABLE IF NOT EXISTS public.transactions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  description text,
  category text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  admin_id uuid,
  is_cancelled boolean DEFAULT false,
  type text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT transactions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id)
);

-- 6) Mahlzeiten
CREATE TABLE IF NOT EXISTS public.meals (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  meal_date timestamp with time zone NOT NULL,
  total_cost numeric,
  status text DEFAULT 'open'::text,
  cost_per_person numeric DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  guest_token text UNIQUE,
  description text,
  CONSTRAINT meals_pkey PRIMARY KEY (id),
  CONSTRAINT meals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

-- 7) Teilnehmer pro Mahlzeit
CREATE TABLE IF NOT EXISTS public.meal_participants (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  meal_id bigint,
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT meal_participants_pkey PRIMARY KEY (id),
  CONSTRAINT meal_participants_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id),
  CONSTRAINT meal_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT meal_participants_meal_user_key UNIQUE (meal_id, user_id)
);

-- 8) Gästeinträge pro Mahlzeit (Name + Betrag)
CREATE TABLE IF NOT EXISTS public.meal_guest_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meal_id bigint NOT NULL,
  guest_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT meal_guest_entries_pkey PRIMARY KEY (id),
  CONSTRAINT meal_guest_entries_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id)
);

-- 9) Abendessen-Anmeldungen (optional)
CREATE TABLE IF NOT EXISTS public.dinner_signups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shift_date date DEFAULT CURRENT_DATE,
  user_id uuid,
  CONSTRAINT dinner_signups_pkey PRIMARY KEY (id),
  CONSTRAINT dinner_signups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 10) Frühstücksbestellungen (Mitglieder) – mit UNIQUE für Upsert
CREATE TABLE IF NOT EXISTS public.fruehstueck_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  date date DEFAULT CURRENT_DATE,
  normal_count integer DEFAULT 0,
  koerner_count integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fruehstueck_orders_pkey PRIMARY KEY (id),
  CONSTRAINT fruehstueck_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT fruehstueck_orders_user_date_key UNIQUE (user_id, date)
);

-- 11) Frühstück Gästebestellungen (Bar-Gäste)
CREATE TABLE IF NOT EXISTS public.fruehstueck_guest_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  guest_name text NOT NULL,
  normal_count integer NOT NULL DEFAULT 0,
  koerner_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fruehstueck_guest_orders_pkey PRIMARY KEY (id),
  CONSTRAINT fruehstueck_guest_orders_date_guest_key UNIQUE (date, guest_name)
);

-- 12) Globale Ausgaben (Kasse)
CREATE TABLE IF NOT EXISTS public.global_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  amount numeric NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'allgemein'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid,
  shift_date date DEFAULT CURRENT_DATE,
  is_cancelled boolean DEFAULT false,
  CONSTRAINT global_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT global_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

-- 13) Push-Abonnements (Web-Push)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- Rezepte / Rezept-Votes (falls genutzt)
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  instructions text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.recipe_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meal_date date NOT NULL,
  user_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recipe_votes_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT recipe_votes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);

CREATE TABLE IF NOT EXISTS public.recipe_vote_results (
  meal_date date NOT NULL,
  winning_recipe_id uuid NOT NULL,
  overwrite_push_sent boolean NOT NULL DEFAULT false,
  applied_at timestamp with time zone,
  applied_by uuid,
  CONSTRAINT recipe_vote_results_pkey PRIMARY KEY (meal_date),
  CONSTRAINT recipe_vote_results_winning_recipe_id_fkey FOREIGN KEY (winning_recipe_id) REFERENCES public.recipes(id),
  CONSTRAINT recipe_vote_results_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.profiles(id)
);

-- Branding (von Admins anpassbar, generische App)
CREATE TABLE IF NOT EXISTS public.app_branding (
  key text NOT NULL,
  value text,
  CONSTRAINT app_branding_pkey PRIMARY KEY (key)
);

INSERT INTO public.app_branding (key, value) VALUES
  ('app_name', 'Kasse'),
  ('app_subtitle', ''),
  ('bug_report_url', ''),
  ('push_default_title', 'Kasse')
ON CONFLICT (key) DO NOTHING;

-- Standard-Einstellungen
INSERT INTO public.app_settings (id, value_bool) VALUES ('registration_enabled', true)
ON CONFLICT (id) DO NOTHING;

-- Index für Gast-Token-Suche
CREATE INDEX IF NOT EXISTS idx_meals_guest_token ON public.meals(guest_token);
CREATE INDEX IF NOT EXISTS idx_fruehstueck_guest_orders_date ON public.fruehstueck_guest_orders(date);
