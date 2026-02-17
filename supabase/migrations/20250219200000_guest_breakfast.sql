-- Gäste: Brötchen bestellen (außerhalb 10-Uhr-Regel) + Abendessen-Infos
-- Brötchen für Mitglied (vom Konto) oder als Bar-Gast (fruehstueck_guest_orders).

-- 1) Tabelle für Gästebestellungen Frühstück (Bar-Gäste)
CREATE TABLE IF NOT EXISTS public.fruehstueck_guest_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  guest_name text NOT NULL,
  normal_count int NOT NULL DEFAULT 0,
  koerner_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, guest_name)
);

CREATE INDEX IF NOT EXISTS idx_fruehstueck_guest_orders_date ON public.fruehstueck_guest_orders(date);

ALTER TABLE public.fruehstueck_guest_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fruehstueck_guest_orders_select_authenticated"
  ON public.fruehstueck_guest_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "fruehstueck_guest_orders_delete_admin"
  ON public.fruehstueck_guest_orders FOR DELETE TO authenticated USING (public.is_admin());

-- INSERT nur über RPC (anon)

-- 2) Brötchen bestellen als Mitglied (vom Konto) – ohne 10-Uhr-Sperre
CREATE OR REPLACE FUNCTION public.guest_breakfast_order(t text, uid uuid, normal_count int, koerner_count int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meal_date date;
  total_amt numeric := (COALESCE(normal_count, 0) * 2.00) + (COALESCE(koerner_count, 0) * 2.50);
BEGIN
  IF t IS NULL OR length(trim(t)) < 4 THEN
    RETURN json_build_object('ok', false, 'error', 'Ungültiger Link');
  END IF;
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Kein Nutzer');
  END IF;

  SELECT m.meal_date INTO meal_date FROM public.meals m WHERE m.guest_token = trim(t) AND m.status = 'open' LIMIT 1;
  IF meal_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Link ungültig');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RETURN json_build_object('ok', false, 'error', 'Nutzer nicht gefunden');
  END IF;

  -- Upsert fruehstueck_orders (wie in Fruehstueck.jsx)
  INSERT INTO public.fruehstueck_orders (user_id, date, normal_count, koerner_count, updated_at)
  VALUES (uid, meal_date, COALESCE(normal_count, 0), COALESCE(koerner_count, 0), now())
  ON CONFLICT (user_id, date) DO UPDATE SET
    normal_count = EXCLUDED.normal_count,
    koerner_count = EXCLUDED.koerner_count,
    updated_at = EXCLUDED.updated_at;

  -- Alte Frühstück-Transaktionen heute für diesen User löschen
  DELETE FROM public.transactions
  WHERE user_id = uid AND category = 'breakfast' AND created_at::date = meal_date;

  -- Neue Transaktion wenn Betrag > 0
  IF total_amt > 0 THEN
    INSERT INTO public.transactions (user_id, amount, description, category)
    VALUES (uid, -total_amt,
      'Frühstück: ' || COALESCE(normal_count, 0) || 'x Normal, ' || COALESCE(koerner_count, 0) || 'x Körner',
      'breakfast');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.guest_breakfast_order(text, uuid, int, int) IS 'Gast-Link: Brötchen für bestehenden Nutzer bestellen (ohne 10-Uhr-Sperre). Anon.';

GRANT EXECUTE ON FUNCTION public.guest_breakfast_order(text, uuid, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_breakfast_order(text, uuid, int, int) TO authenticated;

-- 3) Brötchen bestellen als Bar-Gast (Name, wird vor Ort bezahlt)
CREATE OR REPLACE FUNCTION public.guest_breakfast_order_guest(t text, gname text, normal_count int, koerner_count int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meal_date date;
BEGIN
  IF t IS NULL OR length(trim(t)) < 4 THEN
    RETURN json_build_object('ok', false, 'error', 'Ungültiger Link');
  END IF;
  IF gname IS NULL OR length(trim(gname)) < 1 THEN
    RETURN json_build_object('ok', false, 'error', 'Name angeben');
  END IF;

  SELECT m.meal_date INTO meal_date FROM public.meals m WHERE m.guest_token = trim(t) AND m.status = 'open' LIMIT 1;
  IF meal_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Link ungültig');
  END IF;

  INSERT INTO public.fruehstueck_guest_orders (date, guest_name, normal_count, koerner_count)
  VALUES (meal_date, trim(gname), COALESCE(normal_count, 0), COALESCE(koerner_count, 0))
  ON CONFLICT (date, guest_name) DO UPDATE SET
    normal_count = EXCLUDED.normal_count,
    koerner_count = EXCLUDED.koerner_count;

  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.guest_breakfast_order_guest(text, text, int, int) IS 'Gast-Link: Brötchen als Bar-Gast bestellen. Anon.';

GRANT EXECUTE ON FUNCTION public.guest_breakfast_order_guest(text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_breakfast_order_guest(text, text, int, int) TO authenticated;
