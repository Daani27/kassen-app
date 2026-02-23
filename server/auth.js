import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { query } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 10

if (process.env.NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  console.error('In Produktion muss JWT_SECRET gesetzt sein (mind. 32 Zeichen).')
  process.exit(1)
}
const effectiveSecret = JWT_SECRET || 'change-me-in-production'

export function signToken(payload) {
  return jwt.sign(payload, effectiveSecret, { expiresIn: '7d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, effectiveSecret)
  } catch {
    return null
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

/** Middleware: setzt req.user = { id, email, is_admin } oder 401. is_admin kommt aus der DB (aktuell). */
export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Nicht angemeldet' })
    }
    const decoded = verifyToken(token)
    if (!decoded?.id) {
      return res.status(401).json({ error: 'Ungültiger Token' })
    }
    const profile = await getProfileById(decoded.id)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      is_admin: profile ? !!profile.is_admin : !!decoded.is_admin,
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Optional auth: setzt req.user wenn Token vorhanden. is_admin aus DB. */
export async function optionalAuth(req, res, next) {
  try {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (token) {
      const decoded = verifyToken(token)
      if (decoded?.id) {
        const profile = await getProfileById(decoded.id)
        req.user = {
          id: decoded.id,
          email: decoded.email,
          is_admin: profile ? !!profile.is_admin : !!decoded.is_admin,
        }
      }
    }
    next()
  } catch (err) {
    next(err)
  }
}

export async function getProfileById(id) {
  const r = await query('SELECT id, username, is_admin, last_app_version FROM profiles WHERE id = $1', [id])
  return r.rows[0] || null
}
