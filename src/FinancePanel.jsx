import { useState, useEffect } from 'react'
import {
  apiGetTransactions,
  apiGetGlobalExpenses,
  apiGetProfiles,
  apiCancelTransaction,
  apiCancelGlobalExpense,
  apiInsertTransaction,
  apiInsertGlobalExpense,
} from './api'
import { sendPushToAll } from './pushNotifications'

export default function FinancePanel({ session, isAdmin, onUpdate }) {
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
  const [profilesList, setProfilesList] = useState([])
  const [personExpenseUserId, setPersonExpenseUserId] = useState('')
  const [personExpenseAmount, setPersonExpenseAmount] = useState('')
  const [personExpenseDesc, setPersonExpenseDesc] = useState('')

  useEffect(() => {
    if (isAdmin) fetchFinanceData()
  }, [isAdmin])

  async function notifyCashOpen() {
    const confirmSend = window.confirm('Benachrichtigung senden, dass die Kasse zur Einzahlung offen ist?')
    if (!confirmSend) return
    const result = await sendPushToAll('Kasse ist offen', 'Wer sein Konto aufladen möchte: Die Kasse ist jetzt besetzt. Kommt vorbei!', null)
    if (result.ok) {
      let msg = result.sent > 0 ? `Push an ${result.sent} Gerät(e) gesendet.${result.failed > 0 ? ` (${result.failed} fehlgeschlagen.)` : ''}` : 'Keine Geräte mit aktivierten Push-Benachrichtigungen. Nutzer müssen in den Einstellungen „Push aktivieren“.'
      if (result.hint) msg += '\n\n' + result.hint
      if (result.vapid_debug) msg += `\n\n[Diagnose] Subject: ${result.vapid_debug.subject} | Key-Präfix: ${result.vapid_debug.publicKeyPrefix} (sollte = Anfang von VITE_VAPID_PUBLIC_KEY in .env)`
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

  /** Heute als YYYY-MM-DD in lokaler Zeitzone (für „Essen Heute“ und Abgleich mit shift_date). */
  function getTodayLocal() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** shift_date aus API normalisieren (Postgres kann Date oder String liefern). */
  function shiftDateStr(e) {
    if (e.shift_date == null) return ''
    const s = typeof e.shift_date === 'string' ? e.shift_date : (e.shift_date instanceof Date ? e.shift_date.toISOString().split('T')[0] : String(e.shift_date))
    return s.slice(0, 10)
  }

  async function fetchFinanceData() {
    try {
      const today = getTodayLocal()
      const [userTrans, globalExp, dinnerExp, profiles] = await Promise.all([
        apiGetTransactions(null, true),
        apiGetGlobalExpenses(),
        apiGetGlobalExpenses({ category: 'abendessen', shift_date: today }),
        apiGetProfiles(),
      ])

      const profileMap = {}
      if (profiles) {
        profiles.forEach(p => { profileMap[p.id] = p.username })
        setProfilesList(profiles)
      }

      const globalList = Array.isArray(globalExp) ? globalExp : []
      const income = (userTrans || [])
        .filter(t => Number(t.amount) > 0 && !t.is_cancelled)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

      const expSum = globalList
        .filter(e => !e.is_cancelled)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      setTotalPool(income + expSum)

      // „Essen Heute“: eigene Abfrage mit category+shift_date (Server filtert zuverlässig)
      const dinnerList = Array.isArray(dinnerExp) ? dinnerExp : []
      const todayD = dinnerList
        .filter(e => !e.is_cancelled)
        .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0)
      setDinnerTotal(todayD)

      const allUserTransactions = (userTrans || []).map(t => {
        const amt = Number(t.amount) || 0
        const userLabel = profileMap[t.user_id] || t.user_username || 'Nutzer'
        return {
          id: t.id,
          created_at: t.created_at ?? null,
          description: amt > 0 ? `Einzahlung: ${userLabel}` : (t.description || 'Ausgabe'),
          amount: amt,
          userLabel: amt > 0 ? 'Konto-Aufladung' : userLabel,
          type: 'user_trans',
          is_cancelled: !!t.is_cancelled,
          flowFrom: amt > 0 ? 'Bar (Kasse)' : `Konto ${userLabel}`,
          flowTo: amt > 0 ? `Konto ${userLabel}` : (t.description || 'Ausgabe'),
          accountName: userLabel
        }
      })

      const expenses = globalList.map(e => {
        const amt = Number(e.amount) || 0
        const isEinnahme = amt > 0
        return {
          id: e.id,
          created_at: e.created_at ?? null,
          description: e.description || 'Ausgabe',
          amount: amt,
          userLabel: profileMap[e.created_by] || 'Unbekannt',
          type: 'global_exp',
          is_cancelled: !!e.is_cancelled,
          flowFrom: isEinnahme ? 'Korrektur / Bar' : 'Kasse (Barbestand)',
          flowTo: isEinnahme ? 'Kasse (Barbestand)' : 'Ausgabe',
          createdByName: profileMap[e.created_by] || 'Unbekannt',
          isEinnahme
        }
      })

      const combined = [...allUserTransactions, ...expenses]
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          return tb - ta
        })

      setAllHistory(combined)
      setRecentHistory(combined.slice(0, 25))
    } catch (err) {
      console.error("Fehler im FinancePanel:", err)
    }
  }

  async function toggleCancel(id, type, currentStatus) {
    if (!window.confirm(`Buchung wirklich ${currentStatus ? 'reaktivieren' : 'stornieren'}?`)) return
    setLoading(true)
    try {
      if (type === 'user_trans') await apiCancelTransaction(id)
      else await apiCancelGlobalExpense(id)
      await fetchFinanceData()
    } catch (err) {
      alert('Fehler: ' + (err.data?.error || err.message))
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
      await apiInsertGlobalExpense({
        amount: -Math.abs(val),
        description: desc || (category === 'abendessen' ? 'Einkauf Abendessen' : 'Allgemeine Ausgabe'),
        category,
        shift_date: getTodayLocal(),
      })
      setAmount('')
      setDesc('')
      if (category === 'abendessen') {
        setDinnerTotal(prev => prev + Math.abs(val))
      }
      await fetchFinanceData()
      if (category === 'abendessen' && onUpdate) onUpdate()
    } catch (err) { alert(err.data?.error || err.message) } finally { setLoading(false) }
  }

  /** Ausgabe aus der Kasse für eine bestimmte Person: Abbuchung vom Konto der Person + vom Barbestand. */
  async function addExpenseForPerson() {
    if (!personExpenseUserId || !personExpenseAmount || loading) return
    setLoading(true)
    const val = parseFloat(personExpenseAmount.replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      alert("Bitte einen gültigen Betrag eingeben.")
      setLoading(false)
      return
    }
    const userName = profilesList.find(p => p.id === personExpenseUserId)?.username || 'Person'
    const expenseDesc = personExpenseDesc.trim() || 'Ausgabe für Person'
    const fullDesc = `Ausgabe für ${userName}: ${expenseDesc}`

    try {
      await apiInsertTransaction({
        user_id: personExpenseUserId,
        amount: -Math.abs(val),
        description: fullDesc,
        category: 'ausgabe_person',
      })
      await apiInsertGlobalExpense({
        amount: -Math.abs(val),
        description: fullDesc,
        category: 'ausgabe_person',
        shift_date: new Date().toISOString().split('T')[0],
      })

      setPersonExpenseUserId('')
      setPersonExpenseAmount('')
      setPersonExpenseDesc('')
      await fetchFinanceData()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function adjustBalance() {
    const targetInput = window.prompt("Wie hoch ist der tatsächliche Barbestand?");
    if (!targetInput) return;
    const target = parseFloat(targetInput.replace(',', '.'));
    if (isNaN(target)) return alert("Ungültige Zahl");
    const difference = target - totalPool;
    if (Math.abs(difference) < 0.01) return alert("Stand ist bereits korrekt");

    setLoading(true)
    try {
      await apiInsertGlobalExpense({
        amount: difference,
        description: `Korrektur: ${window.prompt('Grund?', 'Manuelle Korrektur') || 'Korrektur'}`,
        category: 'korrektur',
        shift_date: new Date().toISOString().split('T')[0],
      })
      await fetchFinanceData()
    } catch (err) { alert(err.data?.error || err.message) } finally { setLoading(false) }
  }

  const formatEuro = (val) => (Number(val) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

  const safeDateStr = (item) => {
    try {
      const d = item?.created_at ? new Date(item.created_at) : null
      return d && !Number.isNaN(d.getTime()) ? d.toISOString().split('T')[0] : ''
    } catch {
      return ''
    }
  }

  const hasActiveFilter = searchText.trim() || dateFrom || dateTo || filterAmount
  const displayHistory = hasActiveFilter
    ? allHistory.filter(item => {
        const text = `${item.description || ''} ${item.userLabel || ''}`.toLowerCase()
        const matchText = !searchText.trim() || text.includes(searchText.trim().toLowerCase())
        const d = safeDateStr(item)
        const matchFrom = !dateFrom || d >= dateFrom
        const matchTo = !dateTo || d <= dateTo
        const amt = Number(item.amount) || 0
        const matchAmount = !filterAmount || (filterAmount === 'pos' && amt > 0) || (filterAmount === 'neg' && amt < 0)
        return matchText && matchFrom && matchTo && matchAmount
      })
    : recentHistory

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '30px' }}>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <span style={inputIconStyle}>€</span>
            <input type="text" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyleWithIcon} />
          </div>
          <input type="text" placeholder="Beschreibung (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />

          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
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

      {/* AUSGABE FÜR PERSON (Kasse + Konto abbuchen) */}
      <div style={{ ...cardStyle, borderLeft: '4px solid #8b5cf6' }}>
        <h3 style={sectionTitleStyle}>Ausgabe für Person</h3>
        <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#6b7280' }}>
          Geld aus der Kasse für jemanden ausgegeben (z. B. mitgebracht) – bucht vom Konto der Person und vom Barbestand ab.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select
            value={personExpenseUserId}
            onChange={e => setPersonExpenseUserId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Person wählen...</option>
            {profilesList.map(p => (
              <option key={p.id} value={p.id}>{p.username}</option>
            ))}
          </select>
          <div style={{ position: 'relative' }}>
            <span style={inputIconStyle}>€</span>
            <input
              type="text"
              placeholder="Betrag 0,00"
              value={personExpenseAmount}
              onChange={e => setPersonExpenseAmount(e.target.value)}
              style={inputStyleWithIcon}
            />
          </div>
          <input
            type="text"
            placeholder="Beschreibung (z. B. Zigaretten mitgebracht)"
            value={personExpenseDesc}
            onChange={e => setPersonExpenseDesc(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={addExpenseForPerson}
            disabled={loading || !personExpenseUserId || !personExpenseAmount}
            style={{ ...primaryBtnStyle, backgroundColor: '#8b5cf6' }}
          >
            Ausgabe buchen (Konto + Kasse)
          </button>
        </div>
      </div>

      {/* VERLAUF */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Transaktionsverlauf</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
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
            displayHistory.map(item => {
              const amt = Number(item.amount) || 0
              const createdDate = item?.created_at ? (() => {
                try {
                  const d = new Date(item.created_at)
                  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                } catch { return '' }
              })() : ''
              return (
              <div key={`${item.type}-${item.id}`} style={{
                ...listRowStyle, 
                opacity: item.is_cancelled ? 0.4 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: '700', 
                    fontSize: '0.9rem',
                    textDecoration: item.is_cancelled ? 'line-through' : 'none',
                    color: amt > 0 ? '#10b981' : '#1f2937'
                  }}>
                    {item.description ?? '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                    {item.type === 'user_trans' && (
                      <span>Von: {item.flowFrom ?? '—'} → Zu: {item.flowTo ?? '—'}</span>
                    )}
                    {item.type === 'global_exp' && (
                      <>
                        <span style={{ marginRight: '6px' }}>{item.isEinnahme ? '📥 Einnahme' : '📤 Ausgabe'}: </span>
                        <span>Von: {item.flowFrom ?? '—'} → Zu: {item.flowTo ?? '—'}</span>
                        {item.createdByName && <span> · Veranlasst von: <strong>{item.createdByName}</strong></span>}
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px' }}>
                    {createdDate}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontWeight: '800', 
                    fontSize: '0.95rem',
                    color: item.is_cancelled ? '#9ca3af' : (amt < 0 ? '#ef4444' : '#10b981'),
                    textAlign: 'right',
                    minWidth: '80px'
                  }}>
                    {amt > 0 ? '+' : ''}{(Number(amt) || 0).toFixed(2)} €
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
            )})
          )}
        </div>
      </div>
    </div>
  )
}

// STYLES
const cardStyle = { backgroundColor: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }
const sectionTitleStyle = { margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '800', color: '#111827' }
const labelStyle = { color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '0.9rem', backgroundColor: '#f9fafb', transition: 'border 0.2s', boxSizing: 'border-box' }
const inputStyleWithIcon = { ...inputStyle, paddingLeft: '32px' }
const inputIconStyle = { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontWeight: 'bold', fontSize: '0.9rem' }
const primaryBtnStyle = { flex: 1, padding: '10px 12px', color: 'white', backgroundColor: '#f97316', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 10px rgba(249, 115, 22, 0.2)' }
const secondaryBtnStyle = { flex: 1, padding: '10px 12px', color: '#374151', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }
const notifyBtnStyle = { width: '100%', padding: '10px', backgroundColor: '#0088cc', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' }
const textLinkBtnStyle = { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', marginTop: '8px', textDecoration: 'underline' }
const listRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f9fafb' }
const iconActionBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px', opacity: 0.6 }