import { useEffect, useState } from 'react'
import {
  apiGetActiveMeal,
  apiGetRegistrationEnabled,
  apiSetRegistrationEnabled,
  apiGetProfiles,
  apiGetTransactions,
  apiCancelTransaction,
  apiInsertTransaction,
  apiCreateProfile,
  apiGetFruehstueckSummary,
  apiUpdateBranding,
  apiGetProducts,
  apiCreateProduct,
  apiUpdateProduct,
} from './api'
import { useBranding } from './BrandingContext'
import { sendPushToAll } from './pushNotifications'

export default function AdminPanel({ session }) {
  const [users, setUsers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [regEnabled, setRegEnabled] = useState(true)
  const [fruehstueckSummary, setFruehstueckSummary] = useState({ normal: 0, koerner: 0, users: 0 })
  const [openMealTitle, setOpenMealTitle] = useState(null)

  const [guestName, setGuestName] = useState('')
  const [guestLoading, setGuestLoading] = useState(false)

  const branding = useBranding()
  const [brandingForm, setBrandingForm] = useState({
    app_name: '',
    app_subtitle: '',
    bug_report_url: '',
    push_default_title: '',
  })
  const [brandingSaving, setBrandingSaving] = useState(false)

  const [products, setProducts] = useState([])
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productSaving, setProductSaving] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editProductName, setEditProductName] = useState('')
  const [editProductPrice, setEditProductPrice] = useState('')

  useEffect(() => {
    fetchData()
    fetchSettings()
    fetchFruehstueckSummary()
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const list = await apiGetProducts(true)
      setProducts(Array.isArray(list) ? list : [])
    } catch (_) {
      setProducts([])
    }
  }

  useEffect(() => {
    if (session) fetchOpenMeal()
  }, [session])

  useEffect(() => {
    setBrandingForm({
      app_name: branding.app_name || '',
      app_subtitle: branding.app_subtitle || '',
      bug_report_url: branding.bug_report_url || '',
      push_default_title: branding.push_default_title || branding.app_name || '',
    })
  }, [branding.app_name, branding.app_subtitle, branding.bug_report_url, branding.push_default_title])

  async function fetchOpenMeal() {
    const meal = await apiGetActiveMeal()
    setOpenMealTitle(meal?.title ?? null)
  }

  async function broadcastPush(title, body) {
    await sendPushToAll(title, body, null)
  }

  function notifyAlmostReady() {
    const title = openMealTitle || 'Essen'
    if (!window.confirm("Möchtest du die 'Fast fertig'-Meldung senden?")) return
    broadcastPush('Essen fast fertig', `Das Essen (${title}) steht in ca. 5–10 Minuten auf dem Tisch.`)
  }

  function notifyReady() {
    const title = openMealTitle || 'Essen'
    if (!window.confirm("Soll die 'Essen ist fertig!'-Meldung gesendet werden?")) return
    broadcastPush('Essen ist fertig!', `Kommt in die Küche – ${title} ist serviert!`)
  }

  // SICHERER GAST-LOGIN FIX FÜR ANDROID/PWA
  async function handleCreateGuest(e) {
    e.preventDefault()
    if (!guestName.trim()) return
    setGuestLoading(true)

    const finalName = `Gast: ${guestName.trim()}`

    // Generiert eine ID, auch wenn crypto.randomUUID() im mobilen Browser gesperrt ist
    const fallbackUUID = () => {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      );
    }
    const newId = window.crypto?.randomUUID?.() || fallbackUUID();

    try {
      await apiCreateProfile(finalName)
      alert(`${finalName} wurde angelegt!`)
      setGuestName('')
      fetchData()
    } catch (err) {
      alert('Fehler: ' + (err.data?.error || err.message))
    } finally {
      setGuestLoading(false)
    }
  }

  async function fetchFruehstueckSummary() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const totals = await apiGetFruehstueckSummary(today)
      setFruehstueckSummary(totals || { normal: 0, koerner: 0, users: 0 })
    } catch (_) {}
  }

  async function fetchSettings() {
    try {
      const value = await apiGetRegistrationEnabled()
      setRegEnabled(value)
    } catch (_) {}
  }

  async function toggleRegistration() {
    const nextStatus = !regEnabled
    try {
      await apiSetRegistrationEnabled(nextStatus)
      setRegEnabled(nextStatus)
    } catch (_) {}
  }

  async function saveBranding() {
    setBrandingSaving(true)
    try {
      await apiUpdateBranding(brandingForm)
      branding.refreshBranding?.()
      alert('Branding gespeichert.')
    } catch (e) {
      alert('Fehler: ' + (e.data?.error || e.message))
    } finally {
      setBrandingSaving(false)
    }
  }

  async function fetchData() {
    setLoading(true)
    await fetchUsersAndBalances()
    await fetchTransactionHistory()
    setLoading(false)
  }

  async function fetchUsersAndBalances() {
    const profiles = await apiGetProfiles()
    const trans = await apiGetTransactions(null, true)
    if (profiles) {
      const userBalances = profiles.map(p => {
        const userTrans = trans ? trans.filter(t => t.user_id === p.id && !t.is_cancelled) : []
        const balance = userTrans.reduce((sum, t) => sum + Number(t.amount), 0)
        return { id: p.id, username: p.username, balance }
      })
      setUsers(userBalances.sort((a, b) => a.balance - b.balance))
    }
  }

  async function fetchTransactionHistory() {
    const data = await apiGetTransactions(null, true)
    setTransactions((data || []).slice(0, 100))
  }

  async function handleAddProduct(e) {
    e.preventDefault()
    if (!productName.trim()) return
    const price = parseFloat(String(productPrice).replace(',', '.'))
    if (Number.isNaN(price) || price < 0) {
      alert('Bitte einen gültigen Preis eingeben.')
      return
    }
    setProductSaving(true)
    try {
      await apiCreateProduct({ name: productName.trim(), price })
      setProductName('')
      setProductPrice('')
      fetchProducts()
    } catch (err) {
      alert('Fehler: ' + (err.data?.error || err.message))
    } finally {
      setProductSaving(false)
    }
  }

  function startEditProduct(p) {
    setEditingProductId(p.id)
    setEditProductName(p.name)
    setEditProductPrice(String(p.price))
  }

  function cancelEditProduct() {
    setEditingProductId(null)
    setEditProductName('')
    setEditProductPrice('')
  }

  async function saveEditProduct() {
    if (editingProductId == null) return
    const price = parseFloat(String(editProductPrice).replace(',', '.'))
    if (!editProductName.trim()) {
      alert('Name darf nicht leer sein.')
      return
    }
    if (Number.isNaN(price) || price < 0) {
      alert('Bitte einen gültigen Preis eingeben.')
      return
    }
    setProductSaving(true)
    try {
      await apiUpdateProduct(editingProductId, { name: editProductName.trim(), price })
      cancelEditProduct()
      fetchProducts()
    } catch (err) {
      alert('Fehler: ' + (err.data?.error || err.message))
    } finally {
      setProductSaving(false)
    }
  }

  async function toggleProductActive(p) {
    if (!window.confirm(`Produkt „${p.name}“ wirklich ${p.is_active ? 'deaktivieren' : 'wieder aktivieren'}?`)) return
    try {
      await apiUpdateProduct(p.id, { is_active: !p.is_active })
      fetchProducts()
    } catch (err) {
      alert('Fehler: ' + (err.data?.error || err.message))
    }
  }

  async function toggleCancelTransaction(id, currentStatus) {
    if (!window.confirm(`Buchung wirklich ${currentStatus ? 'reaktivieren' : 'stornieren'}?`)) return
    try {
      await apiCancelTransaction(id)
      fetchData()
    } catch (_) {}
  }

  async function handlePayment(userId, username) {
    const input = window.prompt(`Bargeld-Einzahlung für ${username}:`)
    if (!input || isNaN(input.replace(',', '.'))) return
    const amount = parseFloat(input.replace(',', '.'))
    try {
      await apiInsertTransaction({
        user_id: userId,
        amount,
        description: amount > 0 ? 'Bargeld-Einzahlung' : 'Manuelle Korrektur',
        category: 'payment',
      })
      fetchData()
    } catch (_) {}
  }

  if (loading) return <p style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Lade Admin-Daten...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>

      {/* RUF-FUNKTIONEN (immer verfügbar) */}
      <div style={{ ...cardStyle, borderLeft: '6px solid #f59e0b', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>🔔 Ruf-Funktionen</h3>
        {openMealTitle && <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e' }}>Offene Mahlzeit: {openMealTitle}</p>}
        {!openMealTitle && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>Keine offene Mahlzeit – Push geht mit „Essen“ als Titel.</p>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button onClick={notifyAlmostReady} style={{ ...actionBtnStyle, backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
            ⏳ Fast fertig
          </button>
          <button onClick={notifyReady} style={{ ...actionBtnStyle, backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
            🔔 Essen fertig!
          </button>
        </div>
      </div>

      {/* GAST ANLEGEN SEKTION */}
      <div style={{ ...cardStyle, borderLeft: '6px solid #6366f1' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>👤 Gast hinzufügen</h3>
        <form onSubmit={handleCreateGuest} style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0 12px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.85rem', marginRight: '4px' }}>Gast:</span>
            <input 
              type="text" 
              placeholder="Name" 
              value={guestName} 
              onChange={(e) => setGuestName(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '10px 0', outline: 'none', width: '100%' }}
            />
          </div>
          <button type="submit" disabled={guestLoading} style={{ ...actionBtnStyle, backgroundColor: '#6366f1', color: 'white' }}>
            {guestLoading ? '...' : 'Anlegen'}
          </button>
        </form>
      </div>

      {/* SNACKS & GETRÄNKE (Produkte für Strichliste) */}
      <div style={{ ...cardStyle, borderLeft: '6px solid #f59e0b' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>🥤 Snacks & Getränke</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#6b7280' }}>
          Produkte für die Strichliste. Inaktive erscheinen nicht mehr in der Auswahl.
        </p>
        <form onSubmit={handleAddProduct} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Name (z. B. Cola, Schokoriegel)"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            style={{ ...brandingInputStyle, flex: '1', minWidth: '140px' }}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Preis (€)"
            value={productPrice}
            onChange={(e) => setProductPrice(e.target.value)}
            style={{ ...brandingInputStyle, width: '80px' }}
          />
          <button type="submit" disabled={productSaving} style={{ ...actionBtnStyle, backgroundColor: '#f59e0b', color: 'white' }}>
            {productSaving ? '…' : 'Anlegen'}
          </button>
        </form>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #f3f4f6' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Preis</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f9fafb', opacity: p.is_active ? 1 : 0.6 }}>
                  <td style={tdStyle}>
                    {editingProductId === p.id ? (
                      <input
                        type="text"
                        value={editProductName}
                        onChange={(e) => setEditProductName(e.target.value)}
                        style={{ ...brandingInputStyle, padding: '6px 8px', fontSize: '0.9rem' }}
                      />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingProductId === p.id ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editProductPrice}
                        onChange={(e) => setEditProductPrice(e.target.value)}
                        style={{ ...brandingInputStyle, width: '70px', padding: '6px 8px', fontSize: '0.9rem' }}
                      />
                    ) : (
                      `${Number(p.price).toFixed(2)} €`
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {editingProductId === p.id ? (
                      <>
                        <button onClick={saveEditProduct} disabled={productSaving} style={miniBtnStyle}>Speichern</button>
                        <button onClick={cancelEditProduct} style={miniBtnStyle}>Abbrechen</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEditProduct(p)} style={miniBtnStyle}>Bearbeiten</button>
                        <button onClick={() => toggleProductActive(p)} style={miniBtnStyle}>
                          {p.is_active ? 'Deaktivieren' : 'Aktivieren'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 && <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>Noch keine Produkte. Lege oben ein neues an.</p>}
      </div>

      {/* FRÜHSTÜCKS-CONTROL */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #bae6fd' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '1.5rem' }}>🥖</span>
          <h3 style={{ margin: 0, color: '#0369a1', fontSize: '1.1rem' }}>Einkaufsliste Heute</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>Normal</span>
            <div style={statValueStyle}>{fruehstueckSummary.normal}</div>
          </div>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>Körner</span>
            <div style={statValueStyle}>{fruehstueckSummary.koerner}</div>
          </div>
        </div>
      </div>

      {/* REGISTRATION TOGGLE */}
      <div style={{ ...cardStyle, borderLeft: `6px solid ${regEnabled ? '#10b981' : '#ef4444'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Registrierung</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: regEnabled ? '#10b981' : '#ef4444', fontWeight: '600' }}>
              {regEnabled ? 'Offen für neue Mitglieder' : 'Aktuell gesperrt'}
            </p>
          </div>
          <button onClick={toggleRegistration} style={{ 
            ...actionBtnStyle, 
            backgroundColor: regEnabled ? '#fee2e2' : '#d1fae5',
            color: regEnabled ? '#ef4444' : '#10b981'
          }}>
            {regEnabled ? 'Sperren' : 'Freigeben'}
          </button>
        </div>
      </div>

      {/* BRANDING / APP-NAME (generisch anpassbar) */}
      <div style={{ ...cardStyle, borderLeft: '6px solid #8b5cf6' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>🏷️ App-Name & Branding</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#6b7280' }}>
          Erscheint auf Login, in der App und in Push-Benachrichtigungen. Leer = generischer Name „Kasse“.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#4b5563', marginBottom: '4px' }}>App-Name (z. B. „Kasse WA I“)</label>
            <input
              type="text"
              value={brandingForm.app_name}
              onChange={(e) => setBrandingForm((f) => ({ ...f, app_name: e.target.value }))}
              placeholder="Kasse"
              style={brandingInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#4b5563', marginBottom: '4px' }}>Untertitel (z. B. „Wachabteilung I • Lippstadt“)</label>
            <input
              type="text"
              value={brandingForm.app_subtitle}
              onChange={(e) => setBrandingForm((f) => ({ ...f, app_subtitle: e.target.value }))}
              placeholder=""
              style={brandingInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#4b5563', marginBottom: '4px' }}>Link „Bug melden“ (optional)</label>
            <input
              type="url"
              value={brandingForm.bug_report_url}
              onChange={(e) => setBrandingForm((f) => ({ ...f, bug_report_url: e.target.value }))}
              placeholder="https://…"
              style={brandingInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#4b5563', marginBottom: '4px' }}>Standard-Titel für Push (wenn leer)</label>
            <input
              type="text"
              value={brandingForm.push_default_title}
              onChange={(e) => setBrandingForm((f) => ({ ...f, push_default_title: e.target.value }))}
              placeholder="Kasse"
              style={brandingInputStyle}
            />
          </div>
          <button onClick={saveBranding} disabled={brandingSaving} style={{ ...actionBtnStyle, backgroundColor: '#8b5cf6', color: 'white', alignSelf: 'flex-start' }}>
            {brandingSaving ? 'Speichern…' : 'Branding speichern'}
          </button>
        </div>
      </div>

      {/* SCHULDENLISTE */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>📊 Salden-Übersicht</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #f3f4f6' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Saldo</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={tdStyle}>{u.username || 'Unbekannt'}</td>
                  <td style={{ ...tdStyle, color: u.balance < 0 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                    {u.balance.toFixed(2)} €
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button onClick={() => handlePayment(u.id, u.username)} style={miniBtnStyle}>
                      💶 Cash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRANSAKTIONEN */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>📜 Letzte Buchungen</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {transactions.map(t => (
            <div key={t.id} style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '12px 0', borderBottom: '1px solid #f9fafb',
              opacity: t.is_cancelled ? 0.4 : 1
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{t.user_username || 'System'}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(t.created_at).toLocaleDateString('de-DE')} • {t.description}
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: t.is_cancelled ? '#9ca3af' : (t.amount >= 0 ? '#10b981' : '#ef4444'),
                  fontSize: '0.9rem'
                }}>
                  {t.amount.toFixed(2)} €
                </span>
                <button onClick={() => toggleCancelTransaction(t.id, t.is_cancelled)} style={iconBtnStyle}>
                  {t.is_cancelled ? '🔄' : '🚫'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const cardStyle = { padding: '20px', borderRadius: '20px', backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6' }
const brandingInputStyle = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '0.95rem', boxSizing: 'border-box' }
const statBoxStyle = { padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.8)' }
const statLabelStyle = { display: 'block', fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }
const statValueStyle = { fontSize: '1.4rem', fontWeight: '800', color: '#0f172a' }
const miniBtnStyle = { fontSize: '0.75rem', padding: '6px 12px', cursor: 'pointer', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', color: '#475569' }
const actionBtnStyle = { padding: '8px 16px', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }
const iconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }
const thStyle = { padding: '10px 0', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700' }
const tdStyle = { padding: '12px 0', fontSize: '0.9rem' }