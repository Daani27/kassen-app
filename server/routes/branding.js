import { query } from '../db.js'
import { requireAuth } from '../auth.js'

const KEYS = ['app_name', 'app_subtitle', 'bug_report_url', 'push_default_title']

function toObject(rows) {
  const o = {}
  for (const k of KEYS) o[k] = ''
  for (const r of rows) {
    if (KEYS.includes(r.key)) o[r.key] = r.value ?? ''
  }
  return o
}

export function registerBrandingRoutes(app) {
  /** GET /api/branding – öffentlich, für Login und Footer */
  app.get('/api/branding', async (req, res) => {
    const r = await query('SELECT key, value FROM app_branding WHERE key = ANY($1)', [KEYS])
    const out = toObject(r.rows)
    if (!out.app_name) out.app_name = 'Kasse'
    if (!out.push_default_title) out.push_default_title = out.app_name || 'Kasse'
    return res.json(out)
  })

  /** PATCH /api/branding – nur Admin */
  app.patch('/api/branding', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const body = req.body || {}
    for (const key of KEYS) {
      if (key in body) {
        const value = body[key] != null ? String(body[key]).trim() : ''
        await query(
          'INSERT INTO app_branding (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [key, value]
        )
      }
    }
    const r = await query('SELECT key, value FROM app_branding WHERE key = ANY($1)', [KEYS])
    return res.json(toObject(r.rows))
  })
}
