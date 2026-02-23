import crypto from 'node:crypto'
import { query } from '../db.js'
import { signToken, hashPassword, checkPassword, getProfileById, requireAuth } from '../auth.js'
import { sendPasswordResetEmail, isMailConfigured } from '../mail.js'

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

  /** POST /api/auth/forgot-password – Link zum Zurücksetzen an E-Mail senden */
  app.post('/api/auth/forgot-password', async (req, res) => {
    if (!isMailConfigured()) {
      return res.status(503).json({
        error: 'Passwort-Zurücksetzen ist nicht konfiguriert (SMTP fehlt)',
        hint: 'Admin: In server/.env SMTP_HOST, SMTP_USER, SMTP_PASS und RESET_LINK_BASE setzen.',
      })
    }
    const { email } = req.body || {}
    const emailNorm = (email && String(email).trim().toLowerCase()) || ''
    const msg = 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte Postfach (und Spam) prüfen.'
    if (!emailNorm) {
      return res.json({ message: msg })
    }
    const r = await query('SELECT id FROM users WHERE email = $1', [emailNorm])
    const user = r.rows[0]
    if (!user) {
      return res.json({ message: msg })
    }
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 Stunde
    await query(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    )
    const base = (process.env.RESET_LINK_BASE || '').replace(/\/$/, '')
    const resetLink = base ? `${base}/reset-password?token=${token}` : `${req.protocol}://${req.get('host')}/reset-password?token=${token}`
    let appName = 'Kasse'
    try {
      const br = await query("SELECT value FROM app_branding WHERE key = 'app_name' LIMIT 1")
      if (br.rows[0]?.value) appName = br.rows[0].value
    } catch (_) {}
    const sent = await sendPasswordResetEmail(emailNorm, resetLink, appName)
    if (!sent) {
      return res.status(503).json({ error: 'E-Mail konnte nicht gesendet werden. Bitte Admin kontaktieren.' })
    }
    return res.json({ message: msg })
  })

  /** POST /api/auth/reset-password – Neues Passwort mit Token setzen */
  app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body || {}
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Ungültiger oder abgelaufener Link. Bitte erneut anfordern.' })
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' })
    }
    const r = await query(
      'SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > now()',
      [token.trim()]
    )
    const row = r.rows[0]
    if (!row) {
      return res.status(400).json({ error: 'Ungültiger oder abgelaufener Link. Bitte erneut anfordern.' })
    }
    const hash = await hashPassword(password)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id])
    await query('DELETE FROM password_reset_tokens WHERE token = $1', [token.trim()])
    return res.json({ ok: true, message: 'Passwort wurde geändert. Du kannst dich jetzt anmelden.' })
  })
}
