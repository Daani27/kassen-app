-- Gast-Eintrag für Mahlzeiten: Einmal-Link, Gäste ohne Account
-- 1) Spalte guest_token an meals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals' AND column_name = 'guest_token'
  ) THEN
    ALTER TABLE public.meals ADD COLUMN guest_token text UNIQUE;
  END IF;
END $$;

-- 2) Tabelle für Gästeeinträge (Name + Betrag pro Mahlzeit) – meals.id ist bigint
CREATE TABLE IF NOT EXISTS public.meal_guest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id bigint NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_guest_entries_meal_id ON public.meal_guest_entries(meal_id);

-- RLS: Eingeloggte User (Admins) sehen alle; Anon hat keinen direkten Zugriff (nur über RPC)
ALTER TABLE public.meal_guest_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_guest_entries_select_authenticated"
  ON public.meal_guest_entries FOR SELECT
  TO authenticated
  USING (true);

-- INSERT nur über SECURITY DEFINER Funktion guest_register (anon ruft Funktion auf, kein direkter Tabellenzugriff)

-- Nur Admins dürfen Gästeeinträge löschen
CREATE POLICY "meal_guest_entries_delete_admin"
  ON public.meal_guest_entries FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 3) Öffentliche Funktion: Mahlzeit-Infos per Gast-Token abrufen (für Gast-Seite ohne Login)
CREATE OR REPLACE FUNCTION public.get_meal_for_guest_token(t text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
BEGIN
  IF t IS NULL OR length(trim(t)) < 4 THEN
    RETURN NULL;
  END IF;
  SELECT id, meal_date, title, status INTO m
  FROM public.meals
  WHERE guest_token = trim(t) AND status = 'open'
  LIMIT 1;
  IF m.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'id', m.id,
    'meal_date', m.meal_date,
    'title', m.title
  );
END;
$$;

COMMENT ON FUNCTION public.get_meal_for_guest_token(text) IS 'Für Gast-Link: Gibt Mahlzeit-Infos zurück, wenn Token gültig und Mahlzeit offen. Anon aufrufbar.';

GRANT EXECUTE ON FUNCTION public.get_meal_for_guest_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_meal_for_guest_token(text) TO authenticated;

-- 4) Öffentliche Funktion: Gast eintragen (Name + Betrag)
CREATE OR REPLACE FUNCTION public.guest_register(t text, gname text, amt numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid bigint;
BEGIN
  IF t IS NULL OR length(trim(t)) < 4 THEN
    RETURN json_build_object('ok', false, 'error', 'Ungültiger Link');
  END IF;
  IF gname IS NULL OR length(trim(gname)) < 1 THEN
    RETURN json_build_object('ok', false, 'error', 'Bitte Namen angeben');
  END IF;
  IF amt IS NULL OR amt < 0 THEN
    amt := 0;
  END IF;

  SELECT id INTO mid FROM public.meals WHERE guest_token = trim(t) AND status = 'open' LIMIT 1;
  IF mid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Link abgelaufen oder ungültig');
  END IF;

  INSERT INTO public.meal_guest_entries (meal_id, guest_name, amount)
  VALUES (mid, trim(gname), amt);

  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.guest_register(text, text, numeric) IS 'Gast ohne Account für Mahlzeit eintragen. Anon aufrufbar.';

GRANT EXECUTE ON FUNCTION public.guest_register(text, text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_register(text, text, numeric) TO authenticated;
