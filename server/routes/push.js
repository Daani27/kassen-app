import webPush from 'web-push'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

// web-push erwartet URL-safe Base64 ohne "="-Padding; Keys aus .env normalisieren
function normalizeVapidKey (v) {
  return (v || '').replace(/\s/g, '').replace(/=/g, '')
}
const VAPID_PUBLIC = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY)
const VAPID_PRIVATE = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY)
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:noreply@example.com').trim()

let vapidConfigured = false
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    vapidConfigured = true
  } catch (e) {
    console.warn('VAPID-Keys ungültig, Push deaktiviert:', e.message)
  }
}

export function registerPushRoutes(app) {
  /** POST /api/push/subscribe – Subscription speichern (auth) */
  app.post('/api/push/subscribe', requireAuth, async (req, res) => {
    if (!vapidConfigured) {
      return res.status(503).json({ error: 'Push derzeit nicht konfiguriert (VAPID Keys fehlen oder ungültig)' })
    }
    const { endpoint, keys } = req.body?.subscription || req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' })
    }
    const userId = req.user.id
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET endpoint = $2, p256dh = $3, auth = $4, updated_at = now()`,
      [userId, endpoint, keys.p256dh, keys.auth]
    )
    return res.json({ ok: true })
  })

  /** DELETE /api/push/subscribe – Subscription entfernen (auth) */
  app.delete('/api/push/subscribe', requireAuth, async (req, res) => {
    await query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.id])
    return res.json({ ok: true })
  })

  /** POST /api/send-push – An alle senden (nur Admin) */
  app.post('/api/send-push', requireAuth, async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Nur Admins können Push senden' })
    }
    if (!vapidConfigured) {
      return res.status(503).json({
        error: 'Push nicht konfiguriert (VAPID Keys fehlen oder ungültig)',
        hint: 'In server/.env: VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY setzen (npx web-push generate-vapid-keys). URL-safe Base64 ohne "=". VAPID_SUBJECT=mailto:deine@email.de für iOS.'
      })
    }
    let defaultTitle = 'Kasse'
    try {
      const r = await query("SELECT value FROM app_branding WHERE key = 'push_default_title' LIMIT 1")
      if (r.rows[0]?.value) defaultTitle = r.rows[0].value
    } catch (_) {}
    const title = String(req.body?.title || defaultTitle).slice(0, 100)
    const body = String(req.body?.body || '').slice(0, 500)
    const payload = JSON.stringify({ title, body })

    const subs = await query('SELECT endpoint, p256dh, auth FROM push_subscriptions')
    let sent = 0
    let failed = 0
    for (const row of subs.rows) {
      try {
        await webPush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          { TTL: 86400 }
        )
        sent++
      } catch (e) {
        failed++
        console.warn('Push failed:', row.endpoint?.slice(0, 80), e.message)
      }
    }
    const hint = subs.rows.length === 0
      ? 'Keine Geräte angemeldet. Nutzer müssen in Einstellungen → Push-Benachrichtigungen aktivieren.'
      : null
    return res.json({
      sent,
      failed,
      hint,
      vapid_debug: VAPID_PUBLIC ? { publicKeyPrefix: VAPID_PUBLIC.slice(0, 20), subject: VAPID_SUBJECT } : null
    })
  })
}
