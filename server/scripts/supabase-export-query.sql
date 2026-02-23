-- =============================================================================
-- Export für Import in eigene Datenbank (OHNE direkte DB-Verbindung)
-- =============================================================================
-- 1. Im Supabase Dashboard: SQL Editor öffnen
-- 2. Dieses gesamte Skript einfügen und ausführen (Run)
-- 3. Das Ergebnis ist EINE Zeile mit einer Spalte "export" (großer JSON-Text)
-- 4. In der Ergebnisanzeige: Auf die Zelle klicken, Inhalt kopieren (Strg+A, Strg+C)
-- 5. In einer Datei speichern, z. B. supabase-export.json (nur den JSON-Inhalt, keine weiteren Zeichen)
-- 6. Diese Datei auf den Server legen: server/supabase-export.json
-- 7. Auf dem Server: node scripts/import-from-supabase-json.js
--
-- Falls eine Tabelle in deinem Projekt nicht existiert, erscheint ein Fehler.
-- Dann die entsprechende Zeile unten auskommentieren (-- davor) und erneut ausführen.
-- =============================================================================

SELECT json_build_object(
  'users',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
   FROM (SELECT id, email, encrypted_password AS password_hash, created_at
         FROM auth.users WHERE encrypted_password IS NOT NULL) t),
  'profiles',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.profiles t),
  'app_settings',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.app_settings t),
  'app_branding',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.app_branding t),
  'products',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.products t),
  'transactions',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.transactions t),
  'meals',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.meals t),
  'global_expenses',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.global_expenses t),
  'recipes',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.recipes t),
  'meal_participants',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.meal_participants t),
  'meal_guest_entries',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.meal_guest_entries t),
  'dinner_signups',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.dinner_signups t),
  'fruehstueck_orders',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.fruehstueck_orders t),
  'fruehstueck_guest_orders',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.fruehstueck_guest_orders t),
  'push_subscriptions',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.push_subscriptions t),
  'recipe_votes',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.recipe_votes t),
  'recipe_vote_results',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.recipe_vote_results t)
) AS export;

-- =============================================================================
-- MINIMAL-Version (nur Logins + Profile + Push): Falls die große Abfrage oben
-- mit "relation ... does not exist" fehlschlägt, stattdessen nur diese ausführen:
-- =============================================================================
/*
SELECT json_build_object(
  'users',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
   FROM (SELECT id, email, encrypted_password AS password_hash, created_at
         FROM auth.users WHERE encrypted_password IS NOT NULL) t),
  'profiles',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.profiles t),
  'push_subscriptions',
  (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM public.push_subscriptions t)
) AS export;
*/
