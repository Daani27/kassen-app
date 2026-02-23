import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerTransactionsRoutes(app) {
  /** GET /api/transactions – eigene oder alle (admin) */
  app.get('/api/transactions', requireAuth, async (req, res) => {
    const isAdmin = req.user.is_admin
    const forUser = req.query.user_id || req.user.id
    if (!isAdmin && forUser !== req.user.id) {
      return res.status(403).json({ error: 'Nur eigene Transaktionen' })
    }
    if (isAdmin && req.query.all === 'true') {
      const r = await query(
        `SELECT t.*, p.username as user_username
         FROM transactions t
         LEFT JOIN profiles p ON p.id = t.user_id
         ORDER BY t.created_at DESC LIMIT 500`
      )
      return res.json(r.rows)
    }
    const r = await query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500',
      [forUser]
    )
    return res.json(r.rows)
  })

  /** POST /api/transactions */
  app.post('/api/transactions', requireAuth, async (req, res) => {
    const { user_id, amount, description, category } = req.body || {}
    const targetUserId = user_id || req.user.id
    if (targetUserId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Nur eigene Buchung oder Admin' })
    }
    const amountNum = parseFloat(amount)
    if (Number.isNaN(amountNum)) return res.status(400).json({ error: 'Ungültiger Betrag' })
    const r = await query(
      `INSERT INTO transactions (user_id, amount, description, category, admin_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        targetUserId,
        amountNum,
        description || null,
        category || null,
        req.user.id !== targetUserId ? req.user.id : null,
      ]
    )
    return res.status(201).json(r.rows[0])
  })

  /** PATCH /api/transactions/:id/cancel – is_cancelled umschalten (admin) */
  app.patch('/api/transactions/:id/cancel', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const id = req.params.id
    const r = await query(
      'UPDATE transactions SET is_cancelled = NOT COALESCE(is_cancelled, false) WHERE id = $1 RETURNING *',
      [id]
    )
    if (r.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' })
    return res.json(r.rows[0])
  })
}
