-- RLS für profiles, transactions, meals, meal_participants
-- Analog zu push_subscriptions: Policies basieren auf auth.uid() und Admin-Check über profiles.

-- Hilfsfunktion: Ist der aktuelle User Admin? (wird in Policies genutzt)
-- Liest die eigene Profilzeile; RLS auf profiles muss SELECT für eigene Zeile erlauben.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Gibt true zurück, wenn der eingeloggte User in profiles is_admin = true hat. Für RLS-Policies.';

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ========== PROFILES ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Alle eingeloggten User dürfen alle Profile lesen (Dropdowns, UserManagement, Admin-Check)
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Eigenes Profil darf jeder bearbeiten (z. B. username); Admins dürfen alle bearbeiten (z. B. is_admin)
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    id = auth.uid() OR public.is_admin()
  );

-- Nur Admins dürfen neue Profile anlegen (z. B. Gast-Anlage, UserManagement)
CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Nur Admins dürfen Profile löschen (UserManagement)
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ========== TRANSACTIONS ==========
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- User sieht eigene Transaktionen, Admins sehen alle
CREATE POLICY "transactions_select_own_or_admin"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- Eingeloggte User dürfen Transaktionen anlegen (App-Logik steuert wer was bucht)
CREATE POLICY "transactions_insert_authenticated"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Nur Admins dürfen Transaktionen ändern (z. B. is_cancelled)
CREATE POLICY "transactions_update_admin"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Nur Admins dürfen Transaktionen löschen (falls genutzt)
CREATE POLICY "transactions_delete_admin"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ========== MEALS ==========
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- Alle eingeloggten User dürfen Mahlzeiten lesen
CREATE POLICY "meals_select_authenticated"
  ON public.meals FOR SELECT
  TO authenticated
  USING (true);

-- Nur Admins dürfen Mahlzeiten anlegen, ändern, löschen
CREATE POLICY "meals_insert_admin"
  ON public.meals FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "meals_update_admin"
  ON public.meals FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "meals_delete_admin"
  ON public.meals FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ========== MEAL_PARTICIPANTS ==========
ALTER TABLE public.meal_participants ENABLE ROW LEVEL SECURITY;

-- Alle eingeloggten User dürfen Teilnehmerlisten lesen
CREATE POLICY "meal_participants_select_authenticated"
  ON public.meal_participants FOR SELECT
  TO authenticated
  USING (true);

-- User darf sich selbst eintragen; Admins dürfen beliebige Einträge anlegen
CREATE POLICY "meal_participants_insert_own_or_admin"
  ON public.meal_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR public.is_admin()
  );

-- User darf sich selbst entfernen; Admins dürfen beliebige Einträge entfernen
CREATE POLICY "meal_participants_delete_own_or_admin"
  ON public.meal_participants FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- Kein UPDATE im Alltag; falls nötig: nur Admin
CREATE POLICY "meal_participants_update_admin"
  ON public.meal_participants FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
