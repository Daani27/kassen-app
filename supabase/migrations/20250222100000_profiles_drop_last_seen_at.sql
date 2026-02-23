-- Entfernt last_seen_at (nur Version wird behalten).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN last_seen_at;
  END IF;
END $$;
