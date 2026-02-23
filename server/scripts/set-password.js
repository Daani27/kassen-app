/**
 * Setzt das Passwort eines Benutzers (per E-Mail).
 * Aufruf aus dem server/-Verzeichnis:
 *   node scripts/set-password.js deine-email@example.com neues_passwort
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { query, pool } from '../db.js'
import { hashPassword } from '../auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const email = process.argv[2]
const newPassword = process.argv[3]

if (!email || !newPassword) {
  console.error('Verwendung: node scripts/set-password.js <e-mail@example.com> <neues_passwort>')
  process.exit(1)
}

if (newPassword.length < 6) {
  console.error('Passwort muss mindestens 6 Zeichen haben.')
  process.exit(1)
}

try {
  const hash = await hashPassword(newPassword)
  const r = await query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
    [hash, email.trim()]
  )
  if (r.rowCount === 0) {
    console.error('Kein Benutzer mit dieser E-Mail gefunden:', email)
    process.exit(1)
  }
  console.log('Passwort für', email, 'wurde geändert.')
} catch (e) {
  console.error('Fehler:', e.message)
  process.exit(1)
} finally {
  await pool.end()
}
