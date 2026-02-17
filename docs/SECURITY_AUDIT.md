# Security-Audit: Pentest-Folgen & Fix

## 1. API Keys – Prüfung

| Befund | Status |
|--------|--------|
| **service_role Key** | ✅ **Nur server-seitig:** Er erscheint ausschließlich in `supabase/functions/send-push/index.ts` über `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (Edge Function, Supabase-Umgebung). **Nirgends im Frontend oder in .env.** |
| **Frontend** | Es werden nur `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` verwendet (supabaseClient.js, pushNotifications.js). Der **anon key** ist für Client-Nutzung vorgesehen und respektiert RLS. |

**Hinweis:** Die `.env` enthält den Anon-Key. Dieser darf öffentlich sein, **sofern RLS korrekt konfiguriert ist**. Trotzdem: `.env` sollte nicht ins Repo (siehe .gitignore). Keine anderen Secrets in Frontend-Code gefunden.

---

## 2. Supabase Client – Initialisierung

**Datei:** `src/supabaseClient.js`

```javascript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

✅ Es wird ausschließlich der **Anon Key** verwendet. Korrekt für Client-seitigen Zugriff mit RLS.

---

## 3. Warum RLS das is_admin-Upgrade nicht verhindert hat

**Aktuelle Policy** (aus `20250216000000_rls_profiles_transactions_meals.sql`):

```sql
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    id = auth.uid() OR public.is_admin()
  );
```

- **USING (true):** Jeder eingeloggte User darf prinzipiell Zeilen für UPDATE „sehen“.
- **WITH CHECK:** Nur die **neue** Zeile wird geprüft: Es muss gelten `id = auth.uid()` **oder** der User ist Admin.

Wenn ein normaler User aus der Konsole ausführt:

```js
// PATCH /rest/v1/profiles?id=eq.<eigene-id>
{ "is_admin": true }
```

dann ist die **aktualisierte** Zeile weiterhin seine eigene (`id = auth.uid()`). Die Policy ist erfüllt – **es wird nur die Zeilenidentität und die Admin-Eigenschaft des Users geprüft, nicht ob sich `is_admin` geändert hat.** RLS hat keinen Zugriff auf die **alten** Werte der Zeile; es gibt keine Möglichkeit, in einer reinen RLS-Policy „is_admin darf sich nicht ändern“ auszudrücken. Daher ist das Rechte-Upgrade möglich.

---

## 4. Fix: Trigger statt reiner RLS

RLS allein reicht nicht, um zu erzwingen, dass `is_admin` nur von Admins geändert werden darf. Dafür wird ein **BEFORE UPDATE Trigger** auf `profiles` eingesetzt:

- Wenn der ausführende User **kein** Admin ist (`NOT public.is_admin()`), wird im Trigger **is_admin** auf den **alten** Wert zurückgesetzt: `NEW.is_admin := OLD.is_admin`.
- So können nur Admins das Feld `is_admin` ändern; normale User können weiterhin z. B. `username` und andere erlaubte Felder ändern.

Die Migration dazu liegt in:  
**`supabase/migrations/20250217000000_profiles_prevent_self_admin.sql`**

Nach dem Anwenden dieser Migration verhindert die Datenbank, dass sich jemand per Konsole (oder beliebigem Client) selbst zum Admin macht.

---

## 5. Weitere Sicherheitsprüfung – weitere Befunde

### 5.1 Transaktionen: INSERT für beliebige user_id

**Problem:** Die Policy `transactions_insert_authenticated` erlaubt jedem eingeloggten User, **beliebige** Zeilen einzufügen (`WITH CHECK (auth.uid() IS NOT NULL)`). Ein Angreifer könnte z. B.:

- Transaktionen mit `user_id = <fremde-id>` und negativem Betrag einfügen (Guthaben anderer abbuchen)
- Transaktionen mit `user_id = <eigene-id>` und positivem Betrag einfügen (selbst Guthaben gutschreiben)

**Fix:** INSERT nur erlauben, wenn `user_id = auth.uid()` **oder** der User Admin ist. Migration siehe unten.

---

### 5.2 Tabellen ohne RLS (global_expenses, app_settings, fruehstueck_orders, products)

**Problem:** Für diese Tabellen existiert in den bisherigen Migrations **kein RLS**. Wenn RLS nicht aktiv ist, können alle Clients mit Anon-Key je nach Standardrechten lesen/schreiben. Selbst bei aktiviertem RLS ohne Policies wäre der Zugriff gesperrt – aber wenn die Tabellen vor den RLS-Migrations angelegt wurden, ist RLS ggf. deaktiviert.

**Risiko:**

- **global_expenses:** Sollte nur von Admins (FinancePanel) geschrieben werden; Lesen für Mahlzeiten/Dashboard.
- **app_settings:** `registration_enabled` wird von Login (lesen) und AdminPanel (schreiben) genutzt. Schreiben nur für Admins.
- **fruehstueck_orders:** User sollen nur eigene Einträge lesen/schreiben; Admins alle.
- **products:** Lesen für Strichliste; Schreiben nur Admins (falls genutzt).

**Fix:** RLS für diese Tabellen aktivieren und passende Policies setzen. Migration siehe unten.

---

### 5.3 Edge Function „send-push“: Jeder kann Push auslösen

**Problem:** Jeder eingeloggte User kann die Edge Function `send-push` mit gültigem JWT aufrufen und damit an **alle** Abonnenten Push-Nachrichten senden (Spam/Missbrauch).

**Fix:** In der Edge Function nach der User-Prüfung wird nun `profiles.is_admin` für den User abgefragt; nur bei `is_admin = true` wird der Versand durchgeführt, sonst 403 Forbidden. Siehe `supabase/functions/send-push/index.ts`.

---

### 5.4 Kein XSS/HTML-Injection im Frontend

Es wird kein `dangerouslySetInnerHTML`, `eval` oder direkte `innerHTML`-Zuweisung mit User-Input verwendet. React escaped Ausgaben standardmäßig. ✅

---

### 5.5 Umgesetzte Fixes

| Fix | Datei / Aktion |
|-----|----------------|
| Transaktionen INSERT | Migration `20250217100000_security_rls_transactions_global_tables.sql`: Policy `transactions_insert_own_or_admin` (nur eigene `user_id` oder Admin). |
| RLS global_expenses, app_settings, fruehstueck_orders, products | Dieselbe Migration: RLS aktiviert, Policies wie in Abschnitt 5.2 beschrieben. |
| send-push nur für Admins | `supabase/functions/send-push/index.ts`: Nach JWT-Check Abfrage `profiles.is_admin`; bei nicht Admin → 403. |

**Nach dem Ausführen der Migration** die Edge Function neu deployen:  
`npx supabase functions deploy send-push`

---

### 5.6 Admin-UI nur per Frontend-Logik versteckt

Die Admin-Tabs und -Panels werden nur ausgeblendet, wenn `profile?.is_admin` false ist. Ein Angreifer kann die UI anpassen und Buttons sichtbar machen – **die echte Absicherung liegt in der Datenbank (RLS + Trigger) und in der Edge Function.** Solange RLS und Trigger korrekt sind, bringen manipulierte Requests keine Rechteerweiterung. ✅
