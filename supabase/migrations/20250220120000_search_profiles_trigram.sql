-- Ähnliche Namenssuche (Trigram): Findet auch bei Tippfehlern passende Profile (z. B. Müller/Mueller, Schmidt/Schmid).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.search_profiles_by_name(name text)
RETURNS TABLE(id uuid, username text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_term text := trim(name);
BEGIN
  IF search_term IS NULL OR length(search_term) < 2 THEN
    RETURN;
  END IF;

  SET LOCAL row_security = off;

  RETURN QUERY
  SELECT p.id, p.username
  FROM public.profiles p
  WHERE p.username ILIKE '%' || search_term || '%'
     OR p.username % search_term
  ORDER BY similarity(p.username, search_term) DESC NULLS LAST,
           p.username
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.search_profiles_by_name(text) IS 'Gast-Link: Sucht Profile nach Namen inkl. ähnlicher Schreibweisen (Trigram). Anon aufrufbar.';

GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO authenticated;
