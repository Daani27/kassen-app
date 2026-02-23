import pg from 'pg'

const { Pool } = pg

// Passwort immer als String übergeben (vermeidet "client password must be a string")
const rawUrl = process.env.DATABASE_URL
let poolConfig = { max: 10, idleTimeoutMillis: 30000 }
if (rawUrl) {
  try {
    const url = new URL(rawUrl)
    // DATABASE_PASSWORD aus Env hat Vorrang (hilft bei Sonderzeichen in der URL)
    const password = process.env.DATABASE_PASSWORD !== undefined && process.env.DATABASE_PASSWORD !== ''
      ? process.env.DATABASE_PASSWORD
      : (url.password ?? '')
    poolConfig = {
      ...poolConfig,
      host: url.hostname,
      port: url.port || 5432,
      user: url.username || undefined,
      password: String(password),
      database: (url.pathname || '').replace(/^\//, '') || undefined,
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
    }
  } catch {
    poolConfig.connectionString = rawUrl
  }
} else {
  poolConfig.connectionString = rawUrl
}

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
