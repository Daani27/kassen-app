-- Speichert die zuletzt vom Nutzer genutzte App-Version (für Admin-Übersicht "Wer hat welche Version").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_app_version'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_app_version text;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.last_app_version IS 'Zuletzt vom Nutzer genutzte App-Version (wird beim App-Start aktualisiert).';
