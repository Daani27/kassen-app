/**
 * API-Client für Kasse-App (eigene Backend-Datenbank).
 * Ersetzt Supabase: Auth per JWT, alle Daten über REST.
 */

const BASE = import.meta.env.VITE_API_URL || ''

// localStorage damit Login beim kompletten Schließen der App (PWA/Tab) erhalten bleibt
const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof sessionStorage !== 'undefined' ? sessionStorage : null)

function getToken() {
  try {
    return window.__kasse_token || (storage && storage.getItem('kasse_token')) || null
  } catch {
    return null
  }
}

function setToken(token) {
  try {
    if (token) {
      if (storage) storage.setItem('kasse_token', token)
      window.__kasse_token = token
    } else {
      if (storage) storage.removeItem('kasse_token')
      delete window.__kasse_token
    }
  } catch (_) {}
}

export function getStoredSession() {
  try {
    const raw = storage && storage.getItem('kasse_session')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setStoredSession(session) {
  try {
    if (session) {
      if (storage) storage.setItem('kasse_session', JSON.stringify(session))
      setToken(session.token)
    } else {
      if (storage) storage.removeItem('kasse_session')
      setToken(null)
    }
  } catch (_) {}
}

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
  const headers = { ...(options.headers || {}), 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, { ...options, headers })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {}

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || text || `Fehler ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

// --- Auth ---
export async function apiLogin(email, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  const session = { user: data.user, token: data.token }
  setStoredSession(session)
  return session
}

export async function apiRegister(email, password) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  const session = { user: data.user, token: data.token }
  setStoredSession(session)
  return session
}

export function apiLogout() {
  setStoredSession(null)
}

export async function apiGetSession() {
  const token = getToken()
  if (!token) return null
  try {
    const data = await request('/api/auth/session')
    const session = { user: data.user, token }
    setStoredSession(session)
    return session
  } catch {
    setStoredSession(null)
    return null
  }
}

export async function apiUpdatePassword(password) {
  await request('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  })
}

/** Passwort vergessen: Link an E-Mail senden. Gibt { message } oder wirft bei 503 (SMTP nicht konfiguriert). */
export async function apiForgotPassword(email) {
  const data = await request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: (email || '').trim().toLowerCase() }),
  })
  return data
}

/** Passwort mit Token setzen (nach Klick auf Link in E-Mail). */
export async function apiResetPassword(token, password) {
  const data = await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: (token || '').trim(), password }),
  })
  return data
}

// --- App Settings ---
export async function apiGetRegistrationEnabled() {
  const d = await request('/api/app-settings/registration_enabled')
  return d.value_bool
}

export async function apiSetRegistrationEnabled(value) {
  await request('/api/app-settings/registration_enabled', {
    method: 'PATCH',
    body: JSON.stringify({ value_bool: value }),
  })
}

// --- Branding (öffentlich lesbar, Admin schreibt) ---
export async function apiGetBranding() {
  try {
    return await request('/api/branding')
  } catch {
    return { app_name: 'Kasse', app_subtitle: '', bug_report_url: '', push_default_title: 'Kasse' }
  }
}

export async function apiUpdateBranding(data) {
  return request('/api/branding', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- Profiles ---
export async function apiGetProfiles() {
  return request('/api/profiles')
}

export async function apiGetProfileMe() {
  return request('/api/profiles/me')
}

export async function apiUpdateProfileMe(username) {
  return request('/api/profiles/me', {
    method: 'PATCH',
    body: JSON.stringify({ username }),
  })
}

export async function apiUpdateProfileVersion(version) {
  return request('/api/profiles/me/version', {
    method: 'PATCH',
    body: JSON.stringify({ last_app_version: version }),
  })
}

export async function apiUpdateProfileAdmin(id, is_admin) {
  return request(`/api/profiles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin }),
  })
}

export async function apiDeleteProfile(id) {
  return request(`/api/profiles/${id}`, { method: 'DELETE' })
}

export async function apiCreateProfile(username) {
  return request('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export async function apiSearchProfiles(name) {
  if (!name || name.trim().length < 2) return []
  const q = new URLSearchParams({ name: name.trim() })
  return request(`/api/profiles/search?${q}`)
}

// --- Products ---
export async function apiGetProducts(all = false) {
  const q = all ? '?all=true' : ''
  return request(`/api/products${q}`)
}

export async function apiCreateProduct(payload) {
  return request('/api/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function apiUpdateProduct(id, payload) {
  return request(`/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// --- Transactions ---
export async function apiGetTransactions(userId = null, all = false) {
  const params = new URLSearchParams()
  if (userId) params.set('user_id', userId)
  if (all) params.set('all', 'true')
  const q = params.toString()
  return request(`/api/transactions${q ? '?' + q : ''}`)
}

export async function apiInsertTransaction(payload) {
  return request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function apiCancelTransaction(id) {
  return request(`/api/transactions/${id}/cancel`, { method: 'PATCH' })
}

// --- Meals ---
export async function apiGetActiveMeal() {
  return request('/api/meals?status=open')
}

export async function apiCreateMeal(title, meal_date) {
  return request('/api/meals', {
    method: 'POST',
    body: JSON.stringify({ title, meal_date: meal_date || new Date().toISOString().split('T')[0], status: 'open' }),
  })
}

export async function apiUpdateMeal(id, updates) {
  return request(`/api/meals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function apiDeleteMeal(id) {
  return request(`/api/meals/${id}`, { method: 'DELETE' })
}

export async function apiAddMealParticipant(mealId, userId = null) {
  return request(`/api/meals/${mealId}/participants`, {
    method: 'POST',
    body: JSON.stringify(userId ? { user_id: userId } : {}),
  })
}

export async function apiRemoveMealParticipant(mealId, userId) {
  return request(`/api/meals/${mealId}/participants/${userId}`, { method: 'DELETE' })
}

export async function apiGetMealGuestEntries(mealId) {
  return request(`/api/meals/${mealId}/guest-entries`)
}

export async function apiDeleteMealGuestEntry(id) {
  return request(`/api/meal-guest-entries/${id}`, { method: 'DELETE' })
}

// --- Global expenses ---
export async function apiGetGlobalExpenses(opts = {}) {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.shift_date) params.set('shift_date', opts.shift_date)
  if (opts.all) params.set('all', 'true')
  const q = params.toString()
  return request(`/api/global-expenses${q ? '?' + q : ''}`)
}

export async function apiInsertGlobalExpense(payload) {
  return request('/api/global-expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function apiCancelGlobalExpense(id) {
  return request(`/api/global-expenses/${id}/cancel`, { method: 'PATCH' })
}

// --- Push ---
export async function apiPushSubscribe(subscription) {
  return request('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON?.() || subscription }),
  })
}

export async function apiPushUnsubscribe() {
  return request('/api/push/subscribe', { method: 'DELETE' })
}

export async function apiSendPush(title, body) {
  return request('/api/send-push', {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  })
}

// --- Guest (öffentlich) ---
export async function apiGuestGetMeal(token) {
  const q = new URLSearchParams({ token })
  return request(`/api/guest/meal?${q}`)
}

export async function apiGuestSearchProfiles(name) {
  const q = new URLSearchParams({ name })
  return request(`/api/guest/profiles/search?${q}`)
}

export async function apiGuestRegister(token, gname, amt = 0) {
  return request('/api/guest/register', {
    method: 'POST',
    body: JSON.stringify({ t: token, gname, amt }),
  })
}

export async function apiGuestRegisterAsMember(token, uid) {
  return request('/api/guest/register-as-member', {
    method: 'POST',
    body: JSON.stringify({ t: token, uid }),
  })
}

export async function apiGuestBreakfastOrder(token, uid, normal_count, koerner_count) {
  return request('/api/guest/breakfast-order', {
    method: 'POST',
    body: JSON.stringify({ t: token, uid, normal_count, koerner_count }),
  })
}

export async function apiGuestBreakfastOrderGuest(token, gname, normal_count, koerner_count) {
  return request('/api/guest/breakfast-order-guest', {
    method: 'POST',
    body: JSON.stringify({ t: token, gname, normal_count, koerner_count }),
  })
}

// --- Frühstück ---
export async function apiGetFruehstueckOrder(date, userId = null) {
  const params = new URLSearchParams({ date: date || new Date().toISOString().split('T')[0] })
  if (userId) params.set('user_id', userId)
  return request(`/api/fruehstueck-orders?${params}`)
}

export async function apiUpsertFruehstueckOrder(payload) {
  return request('/api/fruehstueck-orders', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function apiGetFruehstueckSummary(date) {
  const params = new URLSearchParams({ date: date || new Date().toISOString().split('T')[0] })
  return request(`/api/fruehstueck-orders/summary?${params}`)
}
