-- Robuste Namenssuche ohne pg_trgm und ohne SET: nur ILIKE.
-- Anon darf Profile lesen (für Gast-Link), sonst liefert die RPC 0 Zeilen.

DROP POLICY IF EXISTS "profiles_select_anon_guest_search" ON public.profiles;
CREATE POLICY "profiles_select_anon_guest_search"
  ON public.profiles FOR SELECT TO anon
  USING (true);

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

COMMENT ON FUNCTION public.search_profiles_by_name(text) IS 'Gast-Link: Sucht Profile nach Namen (enthält). Anon aufrufbar.';

GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO authenticated;
