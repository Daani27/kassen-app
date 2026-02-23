import crypto from 'node:crypto'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerProfilesRoutes(app) {
  /** GET /api/profiles – alle (auth), für UserManagement */
  app.get('/api/profiles', requireAuth, async (req, res) => {
    const r = await query(
      'SELECT id, username, is_admin, last_app_version FROM profiles ORDER BY username'
    )
    return res.json(r.rows)
  })

  /** GET /api/profiles/me – aktueller User (auth) */
  app.get('/api/profiles/me', requireAuth, async (req, res) => {
    const r = await query(
      'SELECT id, username, is_admin, last_app_version FROM profiles WHERE id = $1',
      [req.user.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Profil nicht gefunden' })
    return res.json(r.rows[0])
  })

  /** PATCH /api/profiles/me – username (auth) */
  app.patch('/api/profiles/me', requireAuth, async (req, res) => {
    const username = req.body?.username != null ? String(req.body.username).trim() : null
    if (username === null) return res.status(400).json({ error: 'username erforderlich' })
    await query('UPDATE profiles SET username = $1, updated_at = now() WHERE id = $2', [
      username,
      req.user.id,
    ])
    const r = await query('SELECT id, username, is_admin FROM profiles WHERE id = $1', [req.user.id])
    return res.json(r.rows[0])
  })

  /** PATCH /api/profiles/me/version – last_app_version (auth) */
  app.patch('/api/profiles/me/version', requireAuth, async (req, res) => {
    const version = req.body?.last_app_version != null ? String(req.body.last_app_version) : null
    await query('UPDATE profiles SET last_app_version = $1, updated_at = now() WHERE id = $2', [
      version,
      req.user.id,
    ])
    return res.json({ ok: true })
  })

  /** PATCH /api/profiles/:id – is_admin (auth, admin) */
  app.patch('/api/profiles/:id', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const id = req.params.id
    const is_admin = !!req.body?.is_admin
    await query('UPDATE profiles SET is_admin = $1, updated_at = now() WHERE id = $2', [
      is_admin,
      id,
    ])
    return res.json({ ok: true })
  })

  /** DELETE /api/profiles/:id (auth, admin) */
  app.delete('/api/profiles/:id', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const id = req.params.id
    try {
      await query('DELETE FROM users WHERE id = $1', [id])
    } catch (_) {}
    const del = await query('DELETE FROM profiles WHERE id = $1 RETURNING id', [id])
    if (del.rowCount === 0) return res.status(404).json({ error: 'Profil nicht gefunden' })
    return res.json({ ok: true })
  })

  /** POST /api/profiles – Gast anlegen (auth, admin): nur Profile, keine User */
  app.post('/api/profiles', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const username = req.body?.username?.trim()
    if (!username) return res.status(400).json({ error: 'username erforderlich' })
    const id = crypto.randomUUID()
    await query('INSERT INTO profiles (id, username, is_admin) VALUES ($1, $2, false)', [
      id,
      username,
    ])
    return res.json({ id, username, is_admin: false })
  })

  /** GET /api/profiles/search?name= – Namenssuche (öffentlich für Gast-Link) */
  app.get('/api/profiles/search', async (req, res) => {
    const name = (req.query.name || '').trim()
    if (name.length < 2) return res.json([])
    const r = await query(
      `SELECT id, username FROM profiles WHERE username ILIKE $1 ORDER BY username LIMIT 10`,
      ['%' + name + '%']
    )
    return res.json(r.rows)
  })
}
