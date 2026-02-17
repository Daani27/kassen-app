import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { sendPushToAll } from './pushNotifications'

export default function FinancePanel({ session, isAdmin }) {
  const [totalPool, setTotalPool] = useState(0)
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [dinnerTotal, setDinnerTotal] = useState(0)
  const [recentHistory, setRecentHistory] = useState([])
  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterAmount, setFilterAmount] = useState('') // "pos" | "neg" | ""

  useEffect(() => {
    if (isAdmin) fetchFinanceData()
  }, [isAdmin])

  async function notifyCashOpen() {
    const confirmSend = window.confirm("Benachrichtigung senden, dass die Kasse zur Einzahlung offen ist?")
    if (!confirmSend) return
    const { data: { session }, error } = await supabase.auth.refreshSession()
    if (error || !session) {
      alert('Session abgelaufen – bitte erneut anmelden.')
      return
    }
    const result = await sendPushToAll('Kasse ist offen', 'Wer sein Konto aufladen möchte: Die Kasse ist jetzt besetzt. Kommt vorbei!', session)
    if (result.ok) {
      let msg = result.sent > 0 ? `Push an ${result.sent} Gerät(e) gesendet.${result.failed > 0 ? ` (${result.failed} fehlgeschlagen.)` : ''}` : 'Keine Geräte mit aktivierten Push-Benachrichtigungen. Nutzer müssen in den Einstellungen „Push aktivieren“.'
      if (result.hint) msg += '\n\n' + result.hint
      if (result.vapid_debug) msg += `\n\n[Diagnose] Subject: ${result.vapid_debug.subject} | Key-Präfix (Supabase): ${result.vapid_debug.publicKeyPrefix} (sollte = Anfang von VITE_VAPID_PUBLIC_KEY in .env)`
      alert(msg)
    } else alert('Push fehlgeschlagen: ' + (result.error || 'Unbekannter Fehler'))
  }

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚫</div>
        <h3 style={{ color: '#111827', margin: '0 0 8px 0' }}>Zugriff verweigert</h3>
        <p style={{ fontSize: '0.9rem' }}>Du hast keine Berechtigung für die Kassenansicht.</p>
      </div>
    )
  }

  async function fetchFinanceData() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: userTrans } = await supabase.from('transactions').select('*')
      const { data: globalExp } = await supabase.from('global_expenses').select('*')
      const { data: profiles } = await supabase.from('profiles').select('id, username')

      const profileMap = {}
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p.username })

      const income = (userTrans || [])
        .filter(t => Number(t.amount) > 0 && !t.is_cancelled)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

      const expSum = (globalExp || [])
        .filter(e => !e.is_cancelled)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      setTotalPool(income + expSum)

      const todayD = (globalExp || [])
        .filter(e => e.category === 'abendessen' && e.shift_date === today && !e.is_cancelled)
        .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0)
      setDinnerTotal(todayD)

      const allUserTransactions = (userTrans || []).map(t => ({
        id: t.id,
        created_at: t.created_at,
        description: t.amount > 0 ? `Einzahlung: ${profileMap[t.user_id]}` : t.description,
        amount: t.amount,
        userLabel: t.amount > 0 ? 'Konto-Aufladung' : (profileMap[t.user_id] || 'Nutzer'),
        type: 'user_trans',
        is_cancelled: t.is_cancelled
      }))

      const expenses = (globalExp || []).map(e => ({
        id: e.id,
        created_at: e.created_at,
        description: e.description,
        amount: e.amount,
        userLabel: profileMap[e.created_by] || 'Unbekannt',
        type: 'global_exp',
        is_cancelled: e.is_cancelled
      }))

      const combined = [...allUserTransactions, ...expenses]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      setAllHistory(combined)
      setRecentHistory(combined.slice(0, 25))
    } catch (err) {
      console.error("Fehler im FinancePanel:", err)
    }
  }

  async function toggleCancel(id, type, currentStatus) {
    if (!window.confirm(`Buchung wirklich ${currentStatus ? "reaktivieren" : "stornieren"}?`)) return
    setLoading(true)
    const table = type === 'user_trans' ? 'transactions' : 'global_expenses'
    try {
      const { error } = await supabase.from(table).update({ is_cancelled: !currentStatus }).eq('id', id)
      if (error) throw error
      await fetchFinanceData()
    } catch (err) {
      alert("Fehler: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function addExpense(category) {
    if (!amount || loading) return
    setLoading(true)
    const val = parseFloat(amount.replace(',', '.'))
    if (isNaN(val)) { alert("Gültige Zahl eingeben"); setLoading(false); return }

    try {
      const { error } = await supabase.from('global_expenses').insert([{
        amount: -Math.abs(val),
        description: desc || (category === 'abendessen' ? 'Einkauf Abendessen' : 'Allgemeine Ausgabe'),
        category: category,
        shift_date: new Date().toISOString().split('T')[0],
        created_by: session?.user?.id,
        is_cancelled: false
      }])
      if (error) throw error
      setAmount(''); setDesc(''); await fetchFinanceData()
    } catch (err) { alert(err.message) } finally { setLoading(false) }
  }

  async function adjustBalance() {
    const targetInput = window.prompt("Wie hoch ist der tatsächliche Barbestand?");
    if (!targetInput) return;
    const target = parseFloat(targetInput.replace(',', '.'));
    if (isNaN(target)) return alert("Ungültige Zahl");
    const difference = target - totalPool;
    if (Math.abs(difference) < 0.01) return alert("Stand ist bereits korrekt");

    setLoading(true);
    try {
      await supabase.from('global_expenses').insert([{
        amount: difference,
        description: `Korrektur: ${window.prompt("Grund?", "Manuelle Korrektur") || "Korrektur"}`,
        category: 'korrektur',
        shift_date: new Date().toISOString().split('T')[0],
        created_by: session?.user?.id,
        is_cancelled: false
      }]);
      await fetchFinanceData();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  }

  const formatEuro = (val) => (Number(val) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

  const hasActiveFilter = searchText.trim() || dateFrom || dateTo || filterAmount
  const displayHistory = hasActiveFilter
    ? allHistory.filter(item => {
        const text = `${item.description} ${item.userLabel}`.toLowerCase()
        const matchText = !searchText.trim() || text.includes(searchText.trim().toLowerCase())
        const d = new Date(item.created_at).toISOString().split('T')[0]
        const matchFrom = !dateFrom || d >= dateFrom
        const matchTo = !dateTo || d <= dateTo
        const matchAmount = !filterAmount || (filterAmount === 'pos' && item.amount > 0) || (filterAmount === 'neg' && item.amount < 0)
        return matchText && matchFrom && matchTo && matchAmount
      })
    : recentHistory

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '30px' }}>

      {/* KASSENSTAND KARTEN */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={cardStyle}>
          <small style={labelStyle}>Barbestand</small>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '1.4rem', color: '#111827' }}>{formatEuro(totalPool)}</h2>
        </div>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #fff 0%, #fff7ed 100%)', borderLeft: '4px solid #f97316' }}>
          <small style={{ ...labelStyle, color: '#f97316' }}>Essen Heute</small>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '1.4rem', color: '#f97316' }}>{formatEuro(dinnerTotal)}</h2>
        </div>
      </div>

      <button onClick={notifyCashOpen} style={notifyBtnStyle}>
        📢 Kasse ist offen (Push-Ankündigung)
      </button>

      {/* AUSGABE BUCHEN */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Neue Ausgabe</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <span style={inputIconStyle}>€</span>
            <input type="text" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyleWithIcon} />
          </div>
          <input type="text" placeholder="Beschreibung (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button onClick={() => addExpense('abendessen')} disabled={loading} style={primaryBtnStyle}>
              🍴 Für Essen
            </button>
            <button onClick={() => addExpense('allgemein')} disabled={loading} style={secondaryBtnStyle}>
              📦 Allgemein
            </button>
          </div>

          <button onClick={adjustBalance} disabled={loading} style={textLinkBtnStyle}>
            🔧 Kassenstand manuell anpassen
          </button>
        </div>
      </div>

      {/* VERLAUF */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Transaktionsverlauf</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Suche (Beschreibung, Name…)"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '120px' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '120px' }} />
            <select value={filterAmount} onChange={e => setFilterAmount(e.target.value)} style={{ ...inputStyle, width: '100px' }}>
              <option value="">Alle Beträge</option>
              <option value="pos">Nur Einzahlungen</option>
              <option value="neg">Nur Ausgaben</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {displayHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '20px' }}>Keine Buchungen gefunden.</p>
          ) : (
            displayHistory.map(item => (
              <div key={`${item.type}-${item.id}`} style={{
                ...listRowStyle, 
                opacity: item.is_cancelled ? 0.4 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: '700', 
                    fontSize: '0.9rem',
                    textDecoration: item.is_cancelled ? 'line-through' : 'none',
                    color: item.amount > 0 ? '#10b981' : '#1f2937'
                  }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {item.userLabel} • {new Date(item.created_at).toLocaleDateString('de-DE')}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontWeight: '800', 
                    fontSize: '0.95rem',
                    color: item.is_cancelled ? '#9ca3af' : (item.amount < 0 ? '#ef4444' : '#10b981'),
                    textAlign: 'right',
                    minWidth: '80px'
                  }}>
                    {item.amount > 0 ? '+' : ''}{item.amount.toFixed(2)} €
                  </span>

                  <button 
                    onClick={() => toggleCancel(item.id, item.type, item.is_cancelled)}
                    disabled={loading}
                    style={iconActionBtnStyle}
                  >
                    {item.is_cancelled ? '🔄' : '🚫'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// STYLES
const cardStyle = { backgroundColor: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }
const sectionTitleStyle = { margin: '0 0 16px 0', fontSize: '1rem', fontWeight: '800', color: '#111827' }
const labelStyle = { color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }
const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '0.95rem', backgroundColor: '#f9fafb', transition: 'border 0.2s' }
const inputStyleWithIcon = { ...inputStyle, paddingLeft: '35px' }
const inputIconStyle = { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontWeight: 'bold' }
const primaryBtnStyle = { flex: 1, padding: '14px', color: 'white', backgroundColor: '#f97316', border: 'none', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(249, 115, 22, 0.2)' }
const secondaryBtnStyle = { flex: 1, padding: '14px', color: '#374151', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer' }
const notifyBtnStyle = { width: '100%', padding: '12px', backgroundColor: '#0088cc', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '0.9rem' }
const textLinkBtnStyle = { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', marginTop: '8px', textDecoration: 'underline' }
const listRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f9fafb' }
const iconActionBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px', opacity: 0.6 }