import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerFruehstueckRoutes(app) {
  /** GET /api/fruehstueck-orders?date=&user_id= – Bestellung für User/Datum */
  app.get('/api/fruehstueck-orders', requireAuth, async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    const userId = req.query.user_id || req.user.id
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Nur eigene Bestellung oder Admin' })
    }
    const r = await query(
      'SELECT normal_count, koerner_count FROM fruehstueck_orders WHERE user_id = $1 AND date = $2 LIMIT 1',
      [userId, date]
    )
    if (r.rows.length === 0) return res.json(null)
    return res.json(r.rows[0])
  })

  /** PUT /api/fruehstueck-orders – Upsert Bestellung + ggf. Transaktionen anpassen */
  app.put('/api/fruehstueck-orders', requireAuth, async (req, res) => {
    const { user_id, date, normal_count, koerner_count } = req.body || {}
    const userId = user_id || req.user.id
    const orderDate = date || new Date().toISOString().split('T')[0]
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Nur eigene Bestellung oder Admin' })
    }
    const n = Math.max(0, parseInt(normal_count, 10) || 0)
    const k = Math.max(0, parseInt(koerner_count, 10) || 0)
    const totalAmount = n * 2 + k * 2.5

    await query(
      `INSERT INTO fruehstueck_orders (user_id, date, normal_count, koerner_count, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, date) DO UPDATE SET
         normal_count = EXCLUDED.normal_count,
         koerner_count = EXCLUDED.koerner_count,
         updated_at = now()`,
      [userId, orderDate, n, k]
    )
    await query(
      "DELETE FROM transactions WHERE user_id = $1 AND category = 'breakfast' AND created_at::date = $2::date",
      [userId, orderDate]
    )
    if (totalAmount > 0) {
      await query(
        `INSERT INTO transactions (user_id, amount, description, category)
         VALUES ($1, $2, $3, 'breakfast')`,
        [userId, -totalAmount, `Frühstück: ${n}x Normal, ${k}x Körner`]
      )
    }
    return res.json({ ok: true })
  })

  /** GET /api/fruehstueck-orders/summary?date= – für Admin (Summe heute) */
  app.get('/api/fruehstueck-orders/summary', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const date = req.query.date || new Date().toISOString().split('T')[0]
    const r = await query(
      'SELECT normal_count, koerner_count FROM fruehstueck_orders WHERE date = $1',
      [date]
    )
    const totals = r.rows.reduce(
      (acc, row) => ({
        normal: acc.normal + (row.normal_count || 0),
        koerner: acc.koerner + (row.koerner_count || 0),
        users: acc.users + 1,
      }),
      { normal: 0, koerner: 0, users: 0 }
    )
    return res.json(totals)
  })
}
