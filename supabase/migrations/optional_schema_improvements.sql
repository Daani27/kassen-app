-- Optionale Schema-Verbesserungen für WA I KASSE
-- Nur ausführen, wenn die genannten Objekte/Constraints noch nicht existieren.

-- 1) profiles: Verknüpfung zu auth.users (falls noch nicht vorhanden)
-- Verhindert "verwaiste" Profile und löscht Profil beim User-Löschen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
    AND conname = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2) push_subscriptions: CASCADE beim User-Löschen (falls FK ohne CASCADE)
-- Dann werden Abos automatisch gelöscht, wenn der User gelöscht wird
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
    AND conname = 'push_subscriptions_user_id_fkey'
  ) THEN
    ALTER TABLE public.push_subscriptions
      DROP CONSTRAINT push_subscriptions_user_id_fkey;
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; -- FK evtl. schon mit CASCADE
END $$;

-- 2b) fruehstueck_orders: UNIQUE(user_id, date) damit Upsert "Bestellung für heute" funktioniert
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS fruehstueck_orders_user_date_key
    ON public.fruehstueck_orders(user_id, date);
EXCEPTION WHEN duplicate_object THEN NULL; -- Constraint/Index existiert bereits
END $$;

-- 3) Nützliche Indizes für häufig genutzte Abfragen
CREATE INDEX IF NOT EXISTS idx_meals_status_created
  ON public.meals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_participants_meal_id
  ON public.meal_participants(meal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_expenses_shift_category
  ON public.global_expenses(shift_date, category);
CREATE INDEX IF NOT EXISTS idx_dinner_signups_shift
  ON public.dinner_signups(shift_date);
CREATE INDEX IF NOT EXISTS idx_fruehstueck_orders_date_user
  ON public.fruehstueck_orders(date, user_id);

-- 4) Kurze Kommentare (optional)
COMMENT ON TABLE public.app_settings IS 'App-weite Einstellungen (Key-Value)';
COMMENT ON TABLE public.profiles IS 'User-Profile, id = auth.users.id';
COMMENT ON TABLE public.push_subscriptions IS 'Web-Push-Abonnements pro User';
