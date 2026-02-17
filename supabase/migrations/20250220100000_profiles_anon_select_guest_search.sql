-- Gast-Link: Namenssuche für nicht eingeloggte Gäste (anon).
-- Die RPC search_profiles_by_name liest aus profiles; ohne diese Policy
-- darf anon keine Zeilen lesen → Suche liefert nie Treffer.

CREATE POLICY "profiles_select_anon_guest_search"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "profiles_select_anon_guest_search" ON public.profiles IS
  'Gast-Link: Anon darf Profile lesen (id, username) für Namensvorschläge.';
