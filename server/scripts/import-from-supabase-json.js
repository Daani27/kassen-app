/**
 * Import aus einer JSON-Export-Datei (keine Live-Verbindung zu Supabase nötig).
 *
 * Ablauf:
 * 1. Im Supabase Dashboard → SQL Editor die Datei server/scripts/supabase-export-query.sql ausführen
 * 2. Ergebnis (eine Spalte "export") kopieren und als server/supabase-export.json speichern
 * 3. Aufruf: node scripts/import-from-supabase-json.js [Pfad/zur/export.json]
 *
 * In server/.env muss DATABASE_URL gesetzt sein (Zieldatenbank).
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverEnv = path.join(__dirname, '..', '.env')
dotenv.config({ path: serverEnv })

const { Pool } = pg

const TARGET_URL = process.env.DATABASE_URL
if (!TARGET_URL) {
  console.error('Fehler: DATABASE_URL in server/.env setzen.')
  process.exit(1)
}

const jsonPath = process.argv[2] || path.join(__dirname, '..', 'supabase-export.json')
if (!fs.existsSync(jsonPath)) {
  console.error('Fehler: JSON-Datei nicht gefunden:', jsonPath)
  console.error('Nutze: node scripts/import-from-supabase-json.js [Pfad/zur/supabase-export.json]')
  process.exit(1)
}

const PUBLIC_TABLE_ORDER = [
  'profiles', 'app_settings', 'app_branding', 'products', 'transactions', 'meals',
  'global_expenses', 'recipes', 'meal_participants', 'meal_guest_entries',
  'dinner_signups', 'fruehstueck_orders', 'fruehstueck_guest_orders',
  'push_subscriptions', 'recipe_votes', 'recipe_vote_results',
]
const TABLES_WITH_IDENTITY = new Set(['products', 'transactions', 'meals', 'meal_participants'])

const targetPool = new Pool({ connectionString: TARGET_URL, max: 2 })

async function run() {
  const raw = fs.readFileSync(jsonPath, 'utf8')
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    console.error('Fehler: Ungültiges JSON in', jsonPath, e.message)
    process.exit(1)
  }

  const target = await targetPool.connect()
  try {
    if (data.users && Array.isArray(data.users) && data.users.length > 0) {
      console.log('Importiere users (auth.users) …')
      let n = 0
      for (const row of data.users) {
        try {
          await target.query(
            `INSERT INTO public.users (id, email, password_hash, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, created_at = EXCLUDED.created_at`,
            [row.id, row.email, row.password_hash, row.created_at]
          )
          n++
        } catch (e) {
          console.warn('  User übersprungen:', row.email, e.message)
        }
      }
      console.log('  ', n, 'User importiert.')
    }

    for (const tableName of PUBLIC_TABLE_ORDER) {
      const rows = data[tableName]
      if (!Array.isArray(rows) || rows.length === 0) {
        if (rows && !Array.isArray(rows)) console.warn('  Überspringe', tableName, '(kein Array)')
        continue
      }

      const targetColsRes = await target.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position
      `, [tableName])
      if (targetColsRes.rows.length === 0) continue
      const targetCols = targetColsRes.rows.map((r) => r.column_name)
      const targetSet = new Set(targetCols)

      let copyCols = targetCols.filter((c) => rows[0] && c in rows[0])
      if (tableName === 'profiles' && !copyCols.includes('username') && targetSet.has('username') && ('full_name' in (rows[0] || {}))) {
        copyCols = [...copyCols, 'username']
      }
      if (copyCols.length === 0) continue

      const escapedCols = copyCols.map((c) => `"${c}"`).join(', ')
      const placeholders = copyCols.map((_, i) => `$${i + 1}`).join(', ')
      const identityHint = TABLES_WITH_IDENTITY.has(tableName) ? ' OVERRIDING SYSTEM VALUE' : ''
      const sql = `INSERT INTO public.${tableName} (${escapedCols})${identityHint} VALUES (${placeholders}) ON CONFLICT DO NOTHING`

      let count = 0
      for (const row of rows) {
        const values = copyCols.map((col) => {
          if (col === 'username' && tableName === 'profiles' && row.full_name != null && row.username == null) return row.full_name
          return row[col]
        })
        try {
          const r = await target.query(sql, values)
          if (r.rowCount > 0) count++
        } catch (e) {
          console.warn('  Zeile übersprungen in', tableName, e.message)
        }
      }
      console.log('  public.' + tableName + ':', count, 'Zeilen importiert.')
    }
    console.log('Import abgeschlossen.')
  } finally {
    target.release()
    await targetPool.end()
  }
}

run().catch((err) => {
  console.error('Fehler:', err.message || err)
  process.exit(1)
})
