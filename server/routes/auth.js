import crypto from 'node:crypto'
import { query } from '../db.js'
import { signToken, hashPassword, checkPassword, getProfileById, requireAuth } from '../auth.js'

export function registerAuthRoutes(app) {
  /** POST /api/auth/register */
  app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body || {}
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' })
    }
    const emailNorm = String(email).trim().toLowerCase()
    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' })
    }

    const reg = await query(
      "SELECT value_bool FROM app_settings WHERE id = 'registration_enabled' LIMIT 1"
    )
    if (reg.rows[0]?.value_bool === false) {
      return res.status(403).json({ error: 'Registrierung ist deaktiviert' })
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [emailNorm])
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'E-Mail bereits registriert' })
    }

    const passwordHash = await hashPassword(password)
    const id = crypto.randomUUID()
    await query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [id, emailNorm, passwordHash]
    )
    await query(
      'INSERT INTO profiles (id, username, is_admin) VALUES ($1, $2, false)',
      [id, emailNorm.split('@')[0] || emailNorm]
    )

    const profile = await getProfileById(id)
    const token = signToken({
      id,
      email: emailNorm,
      is_admin: profile?.is_admin ?? false,
    })
    return res.json({
      token,
      user: { id, email: emailNorm, ...profile },
    })
  })

  /** POST /api/auth/login */
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {}
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' })
    }
    const emailNorm = String(email).trim().toLowerCase()
    const r = await query('SELECT id, password_hash FROM users WHERE email = $1', [emailNorm])
    const user = r.rows[0]
    if (!user || !(await checkPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' })
    }
    const profile = await getProfileById(user.id)
    const token = signToken({
      id: user.id,
      email: emailNorm,
      is_admin: profile?.is_admin ?? false,
    })
    return res.json({
      token,
      user: { id: user.id, email: emailNorm, ...profile },
    })
  })

  /** GET /api/auth/session – aktueller User aus JWT */
  app.get('/api/auth/session', requireAuth, async (req, res) => {
    const profile = await getProfileById(req.user.id)
    return res.json({
      user: { id: req.user.id, email: req.user.email, ...profile },
    })
  })

  /** PATCH /api/auth/password – Passwort ändern (nur eigener User) */
  app.patch('/api/auth/password', requireAuth, async (req, res) => {
    const { password } = req.body || {}
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' })
    }
    const hash = await hashPassword(password)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id])
    return res.json({ ok: true })
  })
}
