import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

// .env sofort laden (wichtig für Skripte: db.js wird vor deren dotenv.config() importiert)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const { Pool } = pg

// Passwort immer explizit als String (vermeidet "client password must be a string")
const rawUrl = process.env.DATABASE_URL || ''
const dbPassword = process.env.DATABASE_PASSWORD
const passwordStr = dbPassword != null && dbPassword !== '' ? String(dbPassword) : null

function buildConfig() {
  try {
    const url = new URL(rawUrl)
    const password = passwordStr ?? url.password ?? ''
    return {
      max: 10,
      idleTimeoutMillis: 30000,
      host: url.hostname || 'localhost',
      port: Number(url.port) || 5432,
      user: url.username || undefined,
      password: String(password),
      database: (url.pathname || '').replace(/^\//, '') || undefined,
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
    }
  } catch {
    if (!rawUrl) return { connectionString: rawUrl }
    const m = rawUrl.match(/^(?:postgres(?:ql)?:)?\/\/(?:([^:]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(\/[^?]*)?/)
    if (m) {
      const [, user, urlPass, host, port, path] = m
      return {
        max: 10,
        idleTimeoutMillis: 30000,
        host: host || 'localhost',
        port: port ? Number(port) : 5432,
        user: user || undefined,
        password: String(passwordStr ?? urlPass ?? ''),
        database: path ? path.replace(/^\//, '') : undefined
      }
    }
    return { connectionString: rawUrl }
  }
}

const poolConfig = buildConfig()
const pool = new Pool(poolConfig)

export async function query(text, params) {
  const client = await pool.connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

export { pool }
