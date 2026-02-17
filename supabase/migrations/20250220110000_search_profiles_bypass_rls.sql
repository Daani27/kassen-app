-- Namenssuche: RLS in der Funktion umgehen, damit anon keine SELECT-Policy auf profiles braucht.
-- Die Funktion läuft als SECURITY DEFINER; mit row_security = off liest sie als Funktionsbesitzer (i.d.R. Table-Owner).

CREATE OR REPLACE FUNCTION public.search_profiles_by_name(name text)
RETURNS TABLE(id uuid, username text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- RLS für diese Transaktion ausschalten (wirkt, wenn Funktionsbesitzer = Table-Owner/Superuser).
  -- Sonst: Policy profiles_select_anon_guest_search (Migration 20250220100000) muss existieren.
  SET LOCAL row_security = off;

  RETURN QUERY
  SELECT p.id, p.username
  FROM public.profiles p
  WHERE trim(name) IS NOT NULL
    AND length(trim(name)) >= 2
    AND p.username ILIKE '%' || trim(name) || '%'
  ORDER BY p.username
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.search_profiles_by_name(text) IS 'Gast-Link: Sucht Profile nach Namen (Vorschläge). Anon aufrufbar.';

-- Berechtigungen beibehalten
GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_by_name(text) TO authenticated;
