import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [regEnabled, setRegEnabled] = useState(true)
  const [fruehstueckSummary, setFruehstueckSummary] = useState({ normal: 0, koerner: 0, users: 0 })

  const [guestName, setGuestName] = useState('')
  const [guestLoading, setGuestLoading] = useState(false)

  useEffect(() => {
    fetchData()
    fetchSettings()
    fetchFruehstueckSummary()
  }, [])

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
      const { error } = await supabase
        .from('profiles')
        .insert([{ id: newId, username: finalName, is_admin: false }])

      if (error) throw error

      alert(`${finalName} wurde angelegt!`)
      setGuestName('')
      fetchData()
    } catch (err) {
      alert("Fehler: " + err.message)
    } finally {
      setGuestLoading(false)
    }
  }

  async function fetchFruehstueckSummary() {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('fruehstueck_orders')
      .select('normal_count, koerner_count')
      .eq('date', today)

    if (!error && data) {
      const totals = data.reduce((acc, curr) => ({
        normal: acc.normal + (curr.normal_count || 0),
        koerner: acc.koerner + (curr.koerner_count || 0),
        users: acc.users + 1
      }), { normal: 0, koerner: 0, users: 0 })
      setFruehstueckSummary(totals)
    }
  }

  async function fetchSettings() {
    const { data, error } = await supabase.from('app_settings').select('value_bool').eq('id', 'registration_enabled').single()
    if (!error && data) setRegEnabled(data.value_bool)
  }

  async function toggleRegistration() {
    const nextStatus = !regEnabled
    const { error } = await supabase.from('app_settings').update({ value_bool: nextStatus }).eq('id', 'registration_enabled')
    if (!error) setRegEnabled(nextStatus)
  }

  async function fetchData() {
    setLoading(true)
    await fetchUsersAndBalances()
    await fetchTransactionHistory()
    setLoading(false)
  }

  async function fetchUsersAndBalances() {
    const { data: profiles } = await supabase.from('profiles').select('id, username')
    const { data: trans } = await supabase.from('transactions').select('user_id, amount, is_cancelled')
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
    const { data, error } = await supabase.from('transactions')
      .select('id, amount, description, created_at, is_cancelled, profiles:user_id ( username )')
      .order('created_at', { ascending: false }).limit(100)
    if (!error) setTransactions(data || [])
  }

  async function toggleCancelTransaction(id, currentStatus) {
    if (!window.confirm(`Buchung wirklich ${currentStatus ? "reaktivieren" : "stornieren"}?`)) return
    const { error } = await supabase.from('transactions').update({ is_cancelled: !currentStatus }).eq('id', id)
    if (!error) fetchData()
  }

  async function handlePayment(userId, username) {
    const input = window.prompt(`Bargeld-Einzahlung für ${username}:`)
    if (!input || isNaN(input.replace(',', '.'))) return
    const amount = parseFloat(input.replace(',', '.'))
    const { error } = await supabase.from('transactions').insert([{
      user_id: userId, amount: amount, description: amount > 0 ? 'Bargeld-Einzahlung' : 'Manuelle Korrektur',
      category: 'payment', is_cancelled: false
    }])
    if (!error) fetchData()
  }

  if (loading) return <p style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Lade Admin-Daten...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>

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
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{t.profiles?.username || 'System'}</div>
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
const statBoxStyle = { padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.8)' }
const statLabelStyle = { display: 'block', fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }
const statValueStyle = { fontSize: '1.4rem', fontWeight: '800', color: '#0f172a' }
const miniBtnStyle = { fontSize: '0.75rem', padding: '6px 12px', cursor: 'pointer', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', color: '#475569' }
const actionBtnStyle = { padding: '8px 16px', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }
const iconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }
const thStyle = { padding: '10px 0', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700' }
const tdStyle = { padding: '12px 0', fontSize: '0.9rem' }