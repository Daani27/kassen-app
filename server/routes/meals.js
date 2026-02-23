import crypto from 'node:crypto'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'

function mealWithParticipants(rows) {
  if (!rows.length) return null
  const m = rows[0]
  const participants = rows
    .filter((r) => r.p_user_id != null)
    .map((r) => ({ user_id: r.p_user_id, profiles: { username: r.p_username } }))
  return {
    id: m.id,
    title: m.title,
    meal_date: m.meal_date,
    total_cost: m.total_cost,
    status: m.status,
    cost_per_person: m.cost_per_person,
    created_by: m.created_by,
    created_at: m.created_at,
    guest_token: m.guest_token,
    description: m.description,
    meal_participants: participants,
  }
}

export function registerMealsRoutes(app) {
  /** GET /api/meals?status=open – aktive Mahlzeit mit allen Teilnehmern (auth) */
  app.get('/api/meals', requireAuth, async (req, res) => {
    const status = req.query.status || 'open'
    // Zuerst die eine offene Mahlzeit (nach neuestem), dann alle ihre Teilnehmer – sonst LIMIT 1 = nur 1 Teilnehmer
    const r = await query(
      `SELECT m.*, mp.user_id AS p_user_id, p.username AS p_username
       FROM (SELECT * FROM meals WHERE status = $1 ORDER BY created_at DESC LIMIT 1) m
       LEFT JOIN meal_participants mp ON mp.meal_id = m.id
       LEFT JOIN profiles p ON p.id = mp.user_id`,
      [status]
    )
    if (r.rows.length === 0) return res.json(null)
    const meal = mealWithParticipants(r.rows)
    const guests = await query(
      'SELECT id, guest_name, amount, created_at FROM meal_guest_entries WHERE meal_id = $1 ORDER BY created_at',
      [meal.id]
    )
    meal.meal_guest_entries = guests.rows
    return res.json(meal)
  })

  /** POST /api/meals – neue Mahlzeit (auth, admin) */
  app.post('/api/meals', requireAuth, async (req, res) => {
    const { title, meal_date, status } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title erforderlich' })
    const date = meal_date || new Date().toISOString().split('T')[0]
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const r = await query(
      `INSERT INTO meals (title, meal_date, created_by, status, guest_token)
       VALUES ($1, $2::timestamptz, $3, $4, $5)
       RETURNING *`,
      [title.trim(), date, req.user.id, status || 'open', token]
    )
    return res.status(201).json(r.rows[0])
  })

  /** PATCH /api/meals/:id */
  app.patch('/api/meals/:id', requireAuth, async (req, res) => {
    const id = req.params.id
    const { total_cost, status, cost_per_person } = req.body || {}
    const updates = []
    const params = [id]
    let idx = 2
    if (total_cost !== undefined) {
      updates.push(`total_cost = $${idx}`)
      params.push(total_cost)
      idx++
    }
    if (status !== undefined) {
      updates.push(`status = $${idx}`)
      params.push(status)
      idx++
    }
    if (cost_per_person !== undefined) {
      updates.push(`cost_per_person = $${idx}`)
      params.push(cost_per_person)
      idx++
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nichts zu aktualisieren' })
    const r = await query(
      `UPDATE meals SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    )
    if (r.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' })
    return res.json(r.rows[0])
  })

  /** DELETE /api/meals/:id (admin) */
  app.delete('/api/meals/:id', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const id = req.params.id
    await query('DELETE FROM meal_participants WHERE meal_id = $1', [id])
    await query('DELETE FROM meal_guest_entries WHERE meal_id = $1', [id])
    const r = await query('DELETE FROM meals WHERE id = $1 RETURNING id', [id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' })
    return res.json({ ok: true })
  })

  /** POST /api/meals/:id/participants – sich oder anderen eintragen (auth) */
  app.post('/api/meals/:id/participants', requireAuth, async (req, res) => {
    const mealId = req.params.id
    const userId = req.body?.user_id || req.user.id
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Nur sich selbst oder Admin' })
    }
    await query(
      'INSERT INTO meal_participants (meal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [mealId, userId]
    )
    return res.json({ ok: true })
  })

  /** DELETE /api/meals/:id/participants/:userId */
  app.delete('/api/meals/:id/participants/:userId', requireAuth, async (req, res) => {
    const { id: mealId, userId } = req.params
    if (userId !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Forbidden' })
    await query('DELETE FROM meal_participants WHERE meal_id = $1 AND user_id = $2', [
      mealId,
      userId,
    ])
    return res.json({ ok: true })
  })

  /** GET /api/meals/:id/guest-entries */
  app.get('/api/meals/:id/guest-entries', requireAuth, async (req, res) => {
    const r = await query(
      'SELECT id, guest_name, amount, created_at FROM meal_guest_entries WHERE meal_id = $1 ORDER BY created_at',
      [req.params.id]
    )
    return res.json(r.rows)
  })

  /** DELETE /api/meal-guest-entries/:id (admin) */
  app.delete('/api/meal-guest-entries/:id', requireAuth, async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const r = await query('DELETE FROM meal_guest_entries WHERE id = $1 RETURNING id', [
      req.params.id,
    ])
    if (r.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' })
    return res.json({ ok: true })
  })
}
