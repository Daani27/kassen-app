import { query } from '../db.js'

/** Öffentliche Gast-Endpoints (ohne Auth, nur mit Token). */

export function registerGuestRoutes(app) {
  /** GET /api/guest/meal?token= – Mahlzeit für Gast-Link */
  app.get('/api/guest/meal', async (req, res) => {
    const t = (req.query.token || '').trim()
    if (t.length < 4) return res.json(null)
    const r = await query(
      `SELECT id, meal_date, title, status FROM meals WHERE guest_token = $1 AND status = 'open' LIMIT 1`,
      [t]
    )
    if (r.rows.length === 0) return res.json(null)
    const m = r.rows[0]
    return res.json({ id: m.id, meal_date: m.meal_date, title: m.title })
  })

  /** GET /api/guest/profiles/search?name= – Namenssuche (wie search_profiles_by_name) */
  app.get('/api/guest/profiles/search', async (req, res) => {
    const name = (req.query.name || '').trim()
    if (name.length < 2) return res.json([])
    const r = await query(
      `SELECT id, username FROM profiles WHERE username ILIKE $1 ORDER BY username LIMIT 10`,
      ['%' + name + '%']
    )
    return res.json(r.rows)
  })

  /** POST /api/guest/register – Gast eintragen (Name + Betrag) */
  app.post('/api/guest/register', async (req, res) => {
    const { t, gname, amt } = req.body || {}
    const token = (t || '').trim()
    const name = (gname || '').trim()
    if (token.length < 4) return res.status(400).json({ ok: false, error: 'Ungültiger Link' })
    if (!name) return res.status(400).json({ ok: false, error: 'Bitte Namen angeben' })
    const amount = parseFloat(amt) || 0
    const meal = await query(
      'SELECT id FROM meals WHERE guest_token = $1 AND status = $2 LIMIT 1',
      [token, 'open']
    )
    if (meal.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Link abgelaufen oder ungültig' })
    }
    const mid = meal.rows[0].id
    await query(
      'INSERT INTO meal_guest_entries (meal_id, guest_name, amount) VALUES ($1, $2, $3)',
      [mid, name, amount]
    )
    return res.json({ ok: true })
  })

  /** POST /api/guest/register-as-member – Gast wählt bestehenden Account */
  app.post('/api/guest/register-as-member', async (req, res) => {
    const { t, uid } = req.body || {}
    const token = (t || '').trim()
    if (token.length < 4) return res.status(400).json({ ok: false, error: 'Ungültiger Link' })
    if (!uid) return res.status(400).json({ ok: false, error: 'Kein Nutzer gewählt' })
    const profile = await query('SELECT id FROM profiles WHERE id = $1', [uid])
    if (profile.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Nutzer nicht gefunden' })
    }
    const meal = await query(
      'SELECT id FROM meals WHERE guest_token = $1 AND status = $2 LIMIT 1',
      [token, 'open']
    )
    if (meal.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Link abgelaufen oder ungültig' })
    }
    const mid = meal.rows[0].id
    const existing = await query(
      'SELECT 1 FROM meal_participants WHERE meal_id = $1 AND user_id = $2',
      [mid, uid]
    )
    if (existing.rows.length > 0) {
      return res.status(400).json({ ok: false, error: 'Du bist bereits eingetragen' })
    }
    await query('INSERT INTO meal_participants (meal_id, user_id) VALUES ($1, $2)', [mid, uid])
    return res.json({ ok: true })
  })

  /** POST /api/guest/breakfast-order – Brötchen für Mitglied (vom Konto) */
  app.post('/api/guest/breakfast-order', async (req, res) => {
    const { t, uid, normal_count, koerner_count } = req.body || {}
    const token = (t || '').trim()
    if (token.length < 4) return res.status(400).json({ ok: false, error: 'Ungültiger Link' })
    if (!uid) return res.status(400).json({ ok: false, error: 'Kein Nutzer' })
    const meal = await query(
      'SELECT meal_date FROM meals WHERE guest_token = $1 AND status = $2 LIMIT 1',
      [token, 'open']
    )
    if (meal.rows.length === 0) return res.status(400).json({ ok: false, error: 'Link ungültig' })
    const mealDate = meal.rows[0].meal_date
    const dateStr = String(mealDate).slice(0, 10)
    const n = Math.max(0, parseInt(normal_count, 10) || 0)
    const k = Math.max(0, parseInt(koerner_count, 10) || 0)
    const totalAmt = n * 2 + k * 2.5

    await query(
      `INSERT INTO fruehstueck_orders (user_id, date, normal_count, koerner_count, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, date) DO UPDATE SET
         normal_count = EXCLUDED.normal_count,
         koerner_count = EXCLUDED.koerner_count,
         updated_at = now()`,
      [uid, dateStr, n, k]
    )
    await query(
      "DELETE FROM transactions WHERE user_id = $1 AND category = 'breakfast' AND created_at::date = $2::date",
      [uid, dateStr]
    )
    if (totalAmt > 0) {
      await query(
        `INSERT INTO transactions (user_id, amount, description, category)
         VALUES ($1, $2, $3, 'breakfast')`,
        [uid, -totalAmt, `Frühstück: ${n}x Normal, ${k}x Körner`]
      )
    }
    return res.json({ ok: true })
  })

  /** POST /api/guest/breakfast-order-guest – Brötchen als Bar-Gast */
  app.post('/api/guest/breakfast-order-guest', async (req, res) => {
    const { t, gname, normal_count, koerner_count } = req.body || {}
    const token = (t || '').trim()
    const gnameTrim = (gname || '').trim()
    if (token.length < 4) return res.status(400).json({ ok: false, error: 'Ungültiger Link' })
    if (!gnameTrim) return res.status(400).json({ ok: false, error: 'Name angeben' })
    const meal = await query(
      'SELECT meal_date FROM meals WHERE guest_token = $1 AND status = $2 LIMIT 1',
      [token, 'open']
    )
    if (meal.rows.length === 0) return res.status(400).json({ ok: false, error: 'Link ungültig' })
    const dateStr = String(meal.rows[0].meal_date).slice(0, 10)
    const n = Math.max(0, parseInt(normal_count, 10) || 0)
    const k = Math.max(0, parseInt(koerner_count, 10) || 0)
    await query(
      `INSERT INTO fruehstueck_guest_orders (date, guest_name, normal_count, koerner_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (date, guest_name) DO UPDATE SET
         normal_count = EXCLUDED.normal_count,
         koerner_count = EXCLUDED.koerner_count`,
      [dateStr, gnameTrim, n, k]
    )
    return res.json({ ok: true })
  })
}
