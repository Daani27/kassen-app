import { query } from '../db.js'
import { requireAuth } from '../auth.js'

export function registerProductsRoutes(app) {
  /** GET /api/products – aktive Produkte */
  app.get('/api/products', requireAuth, async (req, res) => {
    const r = await query(
      'SELECT id, name, price, image_url, is_active FROM products WHERE is_active = true ORDER BY name'
    )
    return res.json(r.rows)
  })
}
