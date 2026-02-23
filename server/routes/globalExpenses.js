import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerGlobalExpensesRoutes(app) {
  /** GET /api/global-expenses. Admin: alle (optional ?all=true inkl. stornierte). Sonst nur mit category+shift_date. */
  app.get('/api/global-expenses', requireAuth, async (req, res) => {
    const category = req.query.category
    const shift_date = req.query.shift_date
    const includeCancelled = req.user.is_admin && !category && !shift_date
    const filtered = category && shift_date
    if (!filtered && !req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    let q = includeCancelled ? 'SELECT * FROM global_expenses WHERE 1=1' : 'SELECT * FROM global_expenses WHERE is_cancelled = false'
    const params = []
    let idx = 1
    if (category) { q += ` AND category = $${idx}`; params.push(category); idx++ }
    if (shift_date) { q += ` AND shift_date = $${idx}`; params.push(shift_date); idx++ }
    q += ' ORDER BY created_at DESC'
    const r = await query(q, params)
    return res.json(r.rows)
  })

  /** POST /api/global-expenses */
  app.post('/api/global-expenses', requireAuth, async (req, res) => {
    const { amount, description, category, shift_date } = req.body || {}
    const amountNum = parseFloat(amount)
    if (Number.isNaN(amountNum)) return res.status(400).json({ error: 'Ungültiger Betrag' })
    const date = shift_date || new Date().toISOString().split('T')[0]
    const r = await query(
      `INSERT INTO global_expenses (amount, description, category, shift_date, created_by, is_cancelled)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [
        amountNum,
        description || 'Allgemeine Ausgabe',
        category || 'allgemein',
        date,
        req.user.id,
      ]
    )
    return res.status(201).json(r.rows[0])
  })

  /** PATCH /api/global-expenses/:id/cancel – is_cancelled umschalten */
  app.patch('/api/global-expenses/:id/cancel', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const r = await query(
      'UPDATE global_expenses SET is_cancelled = NOT COALESCE(is_cancelled, false) WHERE id = $1 RETURNING *',
      [req.params.id]
    )
    if (r.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' })
    return res.json(r.rows[0])
  })
}
