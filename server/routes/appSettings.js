import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerAppSettingsRoutes(app) {
  /** GET /api/app-settings/registration_enabled */
  app.get('/api/app-settings/registration_enabled', async (req, res) => {
    const r = await query(
      "SELECT value_bool FROM app_settings WHERE id = 'registration_enabled' LIMIT 1"
    )
    const value_bool = r.rows[0]?.value_bool ?? true
    return res.json({ value_bool })
  })

  /** PATCH /api/app-settings/registration_enabled (admin) */
  app.patch('/api/app-settings/registration_enabled', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const value_bool = !!req.body?.value_bool
    await query(
      "UPDATE app_settings SET value_bool = $1 WHERE id = 'registration_enabled'"
    , [value_bool])
    return res.json({ value_bool })
  })
}
