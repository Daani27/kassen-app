import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerProductsRoutes(app) {
  /** GET /api/products – aktive Produkte; Admins mit ?all=true sehen alle (inkl. inaktiv) */
  app.get('/api/products', requireAuth, async (req, res) => {
    const all = req.query.all === 'true' && req.user?.is_admin
    const sql = all
      ? 'SELECT id, name, price, image_url, is_active FROM products ORDER BY name'
      : 'SELECT id, name, price, image_url, is_active FROM products WHERE is_active = true ORDER BY name'
    const r = await query(sql)
    return res.json(r.rows)
  })

  /** POST /api/products – neues Produkt (nur Admin) */
  app.post('/api/products', requireAuth, async (req, res) => {
    if (!req.user?.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const { name, price, image_url } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' })
    const p = parseFloat(price)
    if (Number.isNaN(p) || p < 0) return res.status(400).json({ error: 'Preis ungültig' })
    const r = await query(
      'INSERT INTO products (name, price, image_url) VALUES ($1, $2, $3) RETURNING id, name, price, image_url, is_active',
      [name.trim(), p, image_url?.trim() || null]
    )
    return res.status(201).json(r.rows[0])
  })

  /** PATCH /api/products/:id – Produkt bearbeiten oder deaktivieren (nur Admin) */
  app.patch('/api/products/:id', requireAuth, async (req, res) => {
    if (!req.user?.is_admin) return res.status(403).json({ error: 'Nur Admins' })
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' })
    const { name, price, image_url, is_active } = req.body || {}
    const updates = []
    const values = []
    let i = 1
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name darf nicht leer sein' })
      updates.push(`name = $${i++}`)
      values.push(name.trim())
    }
    if (price !== undefined) {
      const p = parseFloat(price)
      if (Number.isNaN(p) || p < 0) return res.status(400).json({ error: 'Preis ungültig' })
      updates.push(`price = $${i++}`)
      values.push(p)
    }
    if (image_url !== undefined) {
      updates.push(`image_url = $${i++}`)
      values.push(image_url?.trim() || null)
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${i++}`)
      values.push(!!is_active)
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nichts zu aktualisieren' })
    values.push(id)
    const r = await query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, price, image_url, is_active`,
      values
    )
    if (r.rows.length === 0) return res.status(404).json({ error: 'Produkt nicht gefunden' })
    return res.json(r.rows[0])
  })
}
