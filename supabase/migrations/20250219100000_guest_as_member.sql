-- Gast-Link: Ähnliche Nutzer vorschlagen, bestehenden Account buchen (wie Admin würde hinzufügen)
-- Es wird KEIN neuer Account angelegt – nur Vorschläge aus profiles oder Eintrag als Bar-Gast.

-- 1) Namenssuche: Profile mit ähnlichem username (für Vorschläge bei Tippfehlern)
CREATE OR REPLACE FUNCTION public.search_profiles_by_name(name text)
RETURNS TABLE(id uuid, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username
  FROM public.profiles p
  WHERE trim(name) IS NOT NULL
    AND length(trim(name)) >= 2
    AND p.username ILIKE '%' || trim(name) || '%'
  ORDER BY p.username
  LIMIT 10;
$$;

COMMENT ON FUNCTION public.search_profiles_by_name(text) IS 'Für Gast-Link: Sucht Profile nach Namen (Vorschläge). Anon aufrufbar. Legt keine Accounts an.';

GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO authenticated;

-- 2) Gast wählt bestehenden Account: als Teilnehmer eintragen (wie Admin hätte ihn hinzugefügt)
CREATE OR REPLACE FUNCTION public.guest_register_as_member(t text, uid uuid)
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
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Kein Nutzer gewählt');
  END IF;

  -- Prüfen ob Nutzer existiert
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RETURN json_build_object('ok', false, 'error', 'Nutzer nicht gefunden');
  END IF;

  SELECT m.id INTO mid FROM public.meals m WHERE m.guest_token = trim(t) AND m.status = 'open' LIMIT 1;
  IF mid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Link abgelaufen oder ungültig');
  END IF;

  -- Bereits eingetragen?
  IF EXISTS (SELECT 1 FROM public.meal_participants WHERE meal_id = mid AND user_id = uid) THEN
    RETURN json_build_object('ok', false, 'error', 'Du bist bereits eingetragen');
  END IF;

  INSERT INTO public.meal_participants (meal_id, user_id) VALUES (mid, uid);
  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.guest_register_as_member(text, uuid) IS 'Gast-Link: Bestehenden Nutzer als Teilnehmer eintragen (wie Admin). Anon aufrufbar.';

GRANT EXECUTE ON FUNCTION public.guest_register_as_member(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_register_as_member(text, uuid) TO authenticated;
