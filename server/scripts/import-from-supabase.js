/**
 * Importiert alle Daten aus Supabase in die eigene PostgreSQL-Datenbank:
 * - auth.users → public.users (Logins mit E-Mail/Passwort)
 * - Alle public-Tabellen in FK-Reihenfolge
 *
 * Voraussetzung:
 * - Schema der Zieldatenbank ist angelegt (server/schema.sql).
 * - In server/.env: DATABASE_URL sowie SUPABASE_DATABASE_URL ODER SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD
 *
 * Aufruf (aus Projektroot oder aus server/):
 *   node server/scripts/import-from-supabase.js
 *   cd server && node scripts/import-from-supabase.js
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

// Immer server/.env laden (egal von wo das Skript gestartet wird)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverEnv = path.join(__dirname, '..', '.env')
const envResult = dotenv.config({ path: serverEnv })
if (envResult.error && process.env.NODE_ENV !== 'production') {
  console.warn('Hinweis: server/.env nicht gefunden unter:', serverEnv)
}

const { Pool } = pg

const TARGET_URL = process.env.DATABASE_URL
let SUPABASE_URL = process.env.SUPABASE_DATABASE_URL
const supabasePasswordOnly = process.env.SUPABASE_DB_PASSWORD
const supabaseHost = process.env.SUPABASE_DB_HOST
const supabasePoolerHost = process.env.SUPABASE_DB_POOLER_HOST
const supabaseProjectRef = process.env.SUPABASE_DB_PROJECT_REF
const supabasePort = process.env.SUPABASE_DB_PORT || '5432'

// Passwort-Platzhalter in SUPABASE_DATABASE_URL ersetzen (aus Dashboard kopieren, Passwort separat)
if (SUPABASE_URL && supabasePasswordOnly && (SUPABASE_URL.includes('[YOUR-PASSWORD]') || SUPABASE_URL.includes('[PASSWORD]'))) {
  SUPABASE_URL = SUPABASE_URL.replace(/\[YOUR-PASSWORD\]|\[PASSWORD\]/g, () => encodeURIComponent(String(supabasePasswordOnly).trim()))
}

const hasFullUrl = !!SUPABASE_URL
const hasHostAndPassword = !!(supabaseHost && supabasePasswordOnly)
const usePooler = !!supabasePoolerHost && !!supabasePasswordOnly
const projectRef = String(supabaseProjectRef || (supabaseHost && supabaseHost.replace(/^db\.|\.supabase\.co$/g, '')) || '').trim()

let resolvedSupabaseUrl = SUPABASE_URL
if (usePooler && projectRef) {
  // Session/Transaction über Pooler: User = postgres.[PROJECT-REF], Host = aws-0-REGION.pooler.supabase.com
  const user = `postgres.${projectRef}`
  const host = String(supabasePoolerHost).trim()
  const port = process.env.SUPABASE_DB_POOLER_PORT || '6543'
  resolvedSupabaseUrl = `postgresql://${user}:${encodeURIComponent(String(supabasePasswordOnly).trim())}@${host}:${port}/postgres`
} else if (hasHostAndPassword) {
  // Direct (5432) oder Transaction auf Direct-Host (6543): User = postgres, Host = db.xxx.supabase.co
  const host = String(supabaseHost).trim().replace(/^@/, '')
  const port = String(supabasePort).trim()
  resolvedSupabaseUrl = `postgresql://postgres:${encodeURIComponent(String(supabasePasswordOnly).trim())}@${host}:${port}/postgres`
}

if (!TARGET_URL) {
  console.error('Fehler: DATABASE_URL fehlt. Gesetzte .env:', serverEnv)
  process.exit(1)
}
if (!resolvedSupabaseUrl) {
  console.error(
    'Fehler: Supabase-Zugang fehlt. In dieser .env eine der Varianten eintragen:\n  ' + serverEnv + '\n' +
    '  A) SUPABASE_DATABASE_URL = komplette URI aus Dashboard (Connect → URI kopieren). Passwort mit Sonderzeichen: [YOUR-PASSWORD] in URL lassen und SUPABASE_DB_PASSWORD setzen.\n' +
    '  B) Direct/Transaction (db.xxx.supabase.co): SUPABASE_DB_HOST=db.xxx.supabase.co, SUPABASE_DB_PASSWORD=..., optional SUPABASE_DB_PORT=6543 für Transaction.\n' +
    '  C) Pooler (Session): SUPABASE_DB_POOLER_HOST=aws-0-REGION.pooler.supabase.com, SUPABASE_DB_PROJECT_REF=xxx, SUPABASE_DB_PASSWORD=...'
  )
  process.exit(1)
}

// Supabase erfordert SSL; pg verwendet sonst ggf. keine verschlüsselte Verbindung
const supabasePool = new Pool({
  connectionString: resolvedSupabaseUrl,
  max: 2,
  ssl: resolvedSupabaseUrl.includes('supabase.co') ? { rejectUnauthorized: true } : false
})
const targetPool = new Pool({ connectionString: TARGET_URL, max: 2 })

/** Tabellen in Reihenfolge (FK-abhängig). Nur Tabellen, die in Supabase existieren können. */
const PUBLIC_TABLE_ORDER = [
  'profiles',
  'app_settings',
  'app_branding',
  'products',
  'transactions',
  'meals',
  'global_expenses',
  'recipes',
  'meal_participants',
  'meal_guest_entries',
  'dinner_signups',
  'fruehstueck_orders',
  'fruehstueck_guest_orders',
  'push_subscriptions',
  'recipe_votes',
  'recipe_vote_results',
]

/** Tabellen mit IDENTITY-Spalte (id bigint) – beim INSERT OVERRIDING SYSTEM VALUE nötig. */
const TABLES_WITH_IDENTITY = new Set([
  'products',
  'transactions',
  'meals',
  'meal_participants',
])

async function run() {
  const target = await targetPool.connect()
  const supabase = await supabasePool.connect()

  try {
    // --- 1) auth.users → public.users (Logins) ---
    console.log('Importiere auth.users → public.users …')
    const usersRes = await supabase.query(`
      SELECT id, email, encrypted_password AS password_hash, created_at
      FROM auth.users
      WHERE encrypted_password IS NOT NULL
    `)
    let inserted = 0
    for (const row of usersRes.rows) {
      try {
        await target.query(
          `INSERT INTO public.users (id, email, password_hash, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             created_at = EXCLUDED.created_at`,
          [row.id, row.email, row.password_hash, row.created_at]
        )
        inserted++
      } catch (e) {
        console.warn('  Warnung: User übersprungen:', row.email, e.message)
      }
    }
    console.log(`  ${inserted} User importiert.`)

    // --- 2) Prüfen, welche public-Tabellen in Supabase existieren ---
    const tablesRes = await supabase.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)
    const existingInSupabase = new Set(tablesRes.rows.map((r) => r.table_name))

    // --- 3) Jede Tabelle in Reihenfolge kopieren ---
    for (const tableName of PUBLIC_TABLE_ORDER) {
      if (!existingInSupabase.has(tableName)) {
        console.log(`Tabelle public.${tableName} in Supabase nicht vorhanden – übersprungen.`)
        continue
      }

      const colsRes = await supabase.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName])
      const columns = colsRes.rows.map((r) => r.column_name)

      const targetColsRes = await target.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName])

      if (targetColsRes.rows.length === 0) {
        console.warn(`  Zieltabelle public.${tableName} existiert nicht – übersprungen.`)
        continue
      }

      const targetCols = new Set(targetColsRes.rows.map((r) => r.column_name))
      let copyCols = columns.filter((c) => targetCols.has(c))
      // Supabase profiles oft mit full_name statt username – dann full_name als username lesen
      if (tableName === 'profiles' && !columns.includes('username') && columns.includes('full_name') && targetCols.has('username')) {
        copyCols = [...copyCols, 'username']
      }
      if (copyCols.length === 0) {
        console.warn(`  Keine gemeinsamen Spalten für public.${tableName} – übersprungen.`)
        continue
      }
      const selectColsSql = (tableName === 'profiles' && copyCols.includes('username') && !columns.includes('username'))
        ? copyCols.filter((c) => c !== 'username').map((c) => `"${c}"`).join(', ') + ', "full_name" AS "username"'
        : copyCols.map((c) => `"${c}"`).join(', ')
      const rows = (await supabase.query(
        `SELECT ${selectColsSql} FROM public.${tableName}`
      )).rows

      // Spaltenliste für INSERT (Identifier escapen)
      const escapedCols = copyCols.map((c) => `"${c}"`).join(', ')
      const placeholders = copyCols.map((_, i) => `$${i + 1}`).join(', ')
      const identityHint = TABLES_WITH_IDENTITY.has(tableName)
        ? ' OVERRIDING SYSTEM VALUE'
        : ''
      const sql = `INSERT INTO public.${tableName} (${escapedCols})${identityHint} VALUES (${placeholders})
        ON CONFLICT DO NOTHING`

      let count = 0
      for (const row of rows) {
        const values = copyCols.map((col) => row[col])
        try {
          const r = await target.query(sql, values)
          if (r.rowCount > 0) count++
        } catch (e) {
          console.warn(`  Zeile in ${tableName} übersprungen:`, e.message)
        }
      }
      console.log(`  public.${tableName}: ${count} Zeilen importiert.`)
    }

    console.log('Import abgeschlossen.')
  } finally {
    supabase.release()
    target.release()
    await supabasePool.end()
    await targetPool.end()
  }
}

run().catch((err) => {
  if (err.code === 'XX000' && /tenant|user not found/i.test(String(err.message))) {
    console.error(
      'Fehler: Supabase-Verbindung – "Tenant or user not found".\n' +
      'Die SUPABASE_DATABASE_URL muss exakt so aus dem Dashboard stammen:\n' +
      '  • Direct: postgresql://postgres:[PASSWORT]@db.[PROJECT-REF].supabase.co:5432/postgres\n' +
      '  • Pooler (Session): postgresql://postgres.[PROJECT-REF]:[PASSWORT]@aws-0-[REGION].pooler.supabase.com:5432/postgres\n' +
      'Project Settings → Database → Connection string kopieren (URI, mit Passwort).'
    )
  } else if (err.code === '28P01') {
    const host = (resolvedSupabaseUrl.match(/@([^/:]+)/) || [])[1] || '(unbekannt)'
    console.error(
      'Fehler: Passwort-Authentifizierung für Supabase fehlgeschlagen (28P01).\n' +
      `Verwendeter Host: ${host}\n` +
      'Prüfen: 1) Richtige .env? (server/.env im Projektordner server/).\n' +
      '2) Database-Passwort aus Supabase: Project Settings → Database → "Database password" (nicht Account-Passwort).\n' +
      '3) Passwort gerade geändert? Einige Sekunden warten und erneut versuchen.\n' +
      '4) Alternative: In server/.env nur Host + Passwort setzen (kein Passwort in URL):\n' +
      '   SUPABASE_DB_HOST=db.xxxx.supabase.co\n' +
      '   SUPABASE_DB_PASSWORD=dein_klares_passwort'
    )
  } else {
    console.error('Fehler:', err.message || err)
  }
  process.exit(1)
})
