# Schema-Verbesserungen

## RLS (Row Level Security)

Die Migration **`supabase/migrations/20250216000000_rls_profiles_transactions_meals.sql`** aktiviert RLS für:

| Tabelle | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| **profiles** | Alle (eingeloggt) | Nur Admin | Eigenes Profil oder Admin | Nur Admin |
| **transactions** | Eigene oder Admin | Eingeloggt | Nur Admin | Nur Admin |
| **meals** | Alle (eingeloggt) | Nur Admin | Nur Admin | Nur Admin |
| **meal_participants** | Alle (eingeloggt) | Selbst oder Admin | Nur Admin | Selbst oder Admin |

Hilfsfunktion **`public.is_admin()`** (SECURITY DEFINER) prüft, ob der aktuelle User in `profiles.is_admin = true` hat – wird in allen Admin-Policies genutzt.

**Wichtig:** Wenn neue User sich per Supabase Auth anmelden und ein **Trigger** automatisch einen Eintrag in `profiles` anlegt, läuft der Trigger mit Definer-Rechten und umgeht RLS. Ohne solchen Trigger müssen Admins Profile manuell anlegen (z. B. über UserManagement/Gast-Anlage).

---

## Optionale Performance-Anpassungen

Diese Anpassungen sind **nicht zwingend**, können aber Konsistenz und Performance verbessern.

## Ausführen

Im **Supabase SQL Editor** den Inhalt von  
`supabase/migrations/optional_schema_improvements.sql`  
ausführen. Die Skripte prüfen selbst, ob ein Constraint/Index schon existiert.

---

## Was wird gemacht?

| Änderung | Zweck |
|----------|--------|
| **profiles.id → auth.users(id) ON DELETE CASCADE** | Jedes Profil gehört zu einem Auth-User; beim Löschen des Users wird das Profil mitgelöscht. |
| **push_subscriptions.user_id → auth.users(id) ON DELETE CASCADE** | Beim Löschen eines Users werden seine Push-Abos entfernt. |
| **Indizes** auf `meals(status, created_at)`, `meal_participants(meal_id)`, `transactions(user_id, created_at)`, `global_expenses(shift_date, category)`, `dinner_signups(shift_date)`, `fruehstueck_orders(date, user_id)` | Schnellere Abfragen für typische Filter/Sortierungen. |
| **COMMENT ON TABLE** | Kurze Beschreibung der Tabellen für die Doku. |

---

## Weitere Ideen (manuell prüfen)

- **RLS (Row Level Security):** Für alle Tabellen mit User-Bezug RLS aktivieren und Policies definieren (z. B. `profiles`, `transactions`, `meals`, `meal_participants`). `push_subscriptions` hat bereits RLS.
- **meals.meal_date:** Wenn nur das **Datum** (Tag) genutzt wird, könnte der Typ von `timestamptz` auf `date` geändert werden – optional, kein Muss.
- **profiles:** Wenn `profiles` per Trigger aus `auth.users` befüllt wird, ist der FK zu `auth.users(id)` sinnvoll (siehe oben).
