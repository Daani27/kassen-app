/**
 * Setzt einen Benutzer (per E-Mail) als Admin.
 * Aufruf aus dem server/-Verzeichnis:
 *   node scripts/make-admin.js deine-email@example.com
 */
import 'dotenv/config'
import { query, pool } from '../db.js'

const email = process.argv[2]
if (!email) {
  console.error('Verwendung: node scripts/make-admin.js <e-mail@example.com>')
  process.exit(1)
}

try {
  const r = await query(
    `UPDATE profiles SET is_admin = true, updated_at = now()
     WHERE id = (SELECT id FROM users WHERE email = $1)
     RETURNING id`,
    [email]
  )
  if (r.rowCount === 0) {
    console.error('Kein Benutzer mit dieser E-Mail gefunden:', email)
    process.exit(1)
  }
  console.log('Admin gesetzt:', email)
} catch (e) {
  console.error('Fehler:', e.message)
  process.exit(1)
} finally {
  await pool.end()
}
