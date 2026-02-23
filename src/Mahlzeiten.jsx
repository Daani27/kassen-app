import { useEffect, useState } from 'react'
import {
  apiGetActiveMeal,
  apiGetProfiles,
  apiGetGlobalExpenses,
  apiDeleteMealGuestEntry,
  apiInsertTransaction,
  apiUpdateMeal,
  apiAddMealParticipant,
  apiRemoveMealParticipant,
  apiCreateMeal,
  apiDeleteMeal,
} from './api'
import { sendPushToAll } from './pushNotifications'

export default function Mahlzeiten({ session, onUpdate }) {
  const [activeMeal, setActiveMeal] = useState(null)
  const [isJoined, setIsJoined] = useState(false)
  const [totalCost, setTotalCost] = useState('')
  const [subsidy, setSubsidy] = useState('') // NEU: Zuschuss-Betrag
  const [sponsorUserId, setSponsorUserId] = useState('') // NEU: Wer gibt den Zuschuss?
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [targetUserId, setTargetUserId] = useState('')
  const [showParticipantsPopup, setShowParticipantsPopup] = useState(false)
  const [guestEntries, setGuestEntries] = useState([])

  const isBeforeDeadline = () => {
    const now = new Date();
    return now.getHours() < 10;
  };

  useEffect(() => {
    if (session) {
      checkAdminStatus();
      fetchActiveMeal();
    }
  }, [session])

  useEffect(() => {
    if (isAdmin) fetchProfiles()
  }, [isAdmin])

  async function broadcastPush(title, body) {
    await sendPushToAll(title, body, null)
  }

  async function checkAdminStatus() {
    setIsAdmin(!!session?.user?.is_admin)
  }

  async function fetchProfiles() {
    try {
      const data = await apiGetProfiles()
      if (data) setProfiles(data)
    } catch (e) { console.error(e) }
  }

  async function fetchActiveMeal() {
    setLoading(true)
    try {
      const meal = await apiGetActiveMeal()
      if (meal) {
        setActiveMeal(meal)
        setIsJoined((meal.meal_participants || []).some(p => p.user_id === session.user.id))
        setGuestEntries(meal.meal_guest_entries || [])
        const mealDate = String(meal.meal_date).slice(0, 10)
        const expenses = await apiGetGlobalExpenses({ category: 'abendessen', shift_date: mealDate })
        const sum = (expenses || []).reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0)
        // Bei offener Mahlzeit immer Summe der Abendessen-Ausgaben als Kostenbasis (wird bei neuer Ausgabe aktuell)
        if (meal.status === 'open') {
          setTotalCost(sum.toString())
        } else if (meal.total_cost != null && meal.total_cost > 0) {
          setTotalCost(Number(meal.total_cost).toString())
        } else {
          setTotalCost(sum.toString())
        }
      } else {
        setActiveMeal(null)
        setGuestEntries([])
      }
    } catch (e) { console.error('Fehler:', e.message) }
    setLoading(false)
  }

  async function removeGuestEntry(entryId) {
    if (!window.confirm('Gästeeintrag wirklich entfernen?')) return
    try {
      await apiDeleteMealGuestEntry(entryId)
      fetchActiveMeal()
      if (onUpdate) onUpdate()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  async function settleMeal() {
    const cost = parseFloat(totalCost) || 0;
    const subAmount = parseFloat(subsidy) || 0;

    if (cost <= 0) return alert("Einkaufspreis fehlt");
    const participants = activeMeal.meal_participants || [];
    const totalHeads = participants.length + guestEntries.length;
    if (totalHeads === 0) return alert("Keine Teilnehmer oder Gäste");

    // Validierung: Wenn Zuschuss, dann muss ein Gönner gewählt sein
    if (subAmount > 0 && !sponsorUserId) {
      return alert("Bitte wähle aus, von welchem Konto der Zuschuss abgezogen werden soll.");
    }

    // Berechnung: (Einkauf - Zuschuss) / alle Köpfe (Mitglieder + Gäste), auf halbe Euro aufrunden
    // +0,50 € nur wenn der exakte Teilbetrag schon x,00 oder x,50 ist (nicht bei Aufrundung aus z. B. 3,21)
    const finalBillableAmount = Math.max(0, cost - subAmount);
    const rawPpp = finalBillableAmount / totalHeads;
    let ppp = Math.ceil(rawPpp * 2) / 2;
    const isExactHalfEuro = Math.round(rawPpp * 100) % 50 === 0; // exakt ,00 oder ,50
    if (isExactHalfEuro) ppp += 0.5;

    const guestInfo = guestEntries.length > 0 ? ` (davon ${guestEntries.length} Gast/Gäste – zahlen bar)` : '';
    const confirmMsg = subAmount > 0 
      ? `Abrechnung mit Zuschuss:\n- Zuschuss: ${subAmount.toFixed(2)}€ von ${profiles.find(p => p.id === sponsorUserId)?.username}\n- Restbetrag: ${finalBillableAmount.toFixed(2)}€\n- ${totalHeads} Köpfe${guestInfo}\n- Pro Kopf: ${ppp.toFixed(2)}€\n\nFortfahren?`
      : `Abrechnung: ${totalHeads} Köpfe${guestInfo}, ${ppp.toFixed(2)}€ pro Person?\n\nFortfahren?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const allTransactions = [];

      // 1. Transaktion für den Gönner (Zuschuss)
      if (subAmount > 0) {
        allTransactions.push({
          user_id: sponsorUserId,
          amount: -subAmount,
          description: `Sponsoring: ${activeMeal.title}`,
          category: 'meal_subsidy'
        });
      }

      // 2. Transaktionen für alle Teilnehmer (Kopfpreis)
      participants.forEach(p => {
        allTransactions.push({
          user_id: p.user_id,
          amount: -ppp,
          description: `Essen: ${activeMeal.title}`
        });
      });

      for (const t of allTransactions) {
        await apiInsertTransaction(t)
      }
      await apiUpdateMeal(activeMeal.id, { status: 'closed', total_cost: cost, cost_per_person: ppp })

      const sponsorName = profiles.find(p => p.id === sponsorUserId)?.username
      let body = `Essen abgerechnet: ${activeMeal.title}. Restkosten: ${ppp.toFixed(2)}€ pro Kopf.`
      if (subAmount > 0) body = `Danke an ${sponsorName} für ${subAmount.toFixed(2)}€ Zuschuss! ${body}`
      broadcastPush('Essen abgerechnet', body)

      alert(`Erfolgreich abgerechnet!`);
      setTotalCost('');
      setSubsidy('');
      setSponsorUserId('');
      fetchActiveMeal();
      if (onUpdate) onUpdate();
    } catch (e) { alert("Fehler bei der Abrechnung: " + e.message); }
  }

  async function joinMeal() {
    if ((activeMeal.meal_participants || []).some(p => p.user_id === session.user.id)) return
    await apiAddMealParticipant(activeMeal.id)
    fetchActiveMeal()
    if (onUpdate) onUpdate()
  }

  async function addParticipantAsAdmin() {
    if (!targetUserId) return alert('Bitte wähle einen Kameraden aus.')
    try {
      await apiAddMealParticipant(activeMeal.id, targetUserId)
      setTargetUserId('')
      fetchActiveMeal()
      if (onUpdate) onUpdate()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  async function saveMealDisplayCost() {
    if (!activeMeal) return
    const val = parseFloat(totalCost)
    if (isNaN(val) || val < 0) return alert('Bitte einen gültigen Betrag (≥ 0) eintragen.')
    try {
      await apiUpdateMeal(activeMeal.id, { total_cost: val })
      alert('Anzeige aktualisiert. Die Kosten pro Person werden damit neu berechnet.')
      if (onUpdate) onUpdate()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  async function leaveMeal() { await removeParticipant(session.user.id) }

  async function removeParticipant(participantUserId) {
    try {
      await apiRemoveMealParticipant(activeMeal.id, participantUserId)
      fetchActiveMeal()
      if (onUpdate) onUpdate()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  async function createMeal() {
    const title = window.prompt('Was gibt es zu essen?')
    if (!title) return
    try {
      await apiCreateMeal(title)
      broadcastPush('Neue Mahlzeit', `Heute gibt es: ${title}. Tragt euch bitte in der App ein!`)
      fetchActiveMeal()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  async function deleteMeal() {
    if (!window.confirm(`Liste "${activeMeal.title}" wirklich löschen?`)) return
    try {
      await apiDeleteMeal(activeMeal.id)
      setActiveMeal(null)
      fetchActiveMeal()
      if (onUpdate) onUpdate()
    } catch (e) { alert('Fehler: ' + (e.data?.error || e.message)) }
  }

  if (loading) return <div style={cardStyle}>Lade Mahlzeiten...</div>
  const isBreakfast = activeMeal?.title?.toLowerCase().includes('frühstück');
  const canLeave = isAdmin || !isBreakfast || isBeforeDeadline();

  return (
    <div style={cardStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={titleStyle}>🍴 Mahlzeiten</h3>
          <p style={subtitleStyle}>Gemeinsames Essen planen</p>
        </div>
        {isAdmin && !activeMeal && (
          <button onClick={createMeal} style={createBtnStyle}>Neu</button>
        )}
      </header>

      {!activeMeal ? (
        <div style={emptyStateStyle}>Aktuell ist keine Liste offen.</div>
      ) : (
        <div>
          <div style={mealHeaderStyle}>
            <span style={mealTitleStyle}>{activeMeal.title}</span>
            <span style={mealBadgeStyle}>AKTIV</span>
            {isAdmin && <button onClick={deleteMeal} style={deleteBtnStyle}>🗑️</button>}
          </div>

          <button onClick={() => setShowParticipantsPopup(true)} style={participantsToggleStyle}>
             <span style={{fontSize: '1.2rem'}}>👥</span>
             <span><b>{(activeMeal.meal_participants?.length || 0) + guestEntries.length}</b> Teilnehmer{guestEntries.length > 0 ? ` (davon ${guestEntries.length} Gast)` : ''}</span>
          </button>

          {!isJoined ? (
            <button onClick={joinMeal} style={joinBtnStyle}>Ich esse mit! ✋</button>
          ) : (
            <div style={statusBoxStyle}>
              <div style={{ color: '#10b981', fontWeight: '800' }}>✅ Du bist dabei</div>
              {canLeave ? (
                <button onClick={leaveMeal} style={leaveLinkStyle}>Abmelden</button>
              ) : (
                <small style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Sperre nach 10 Uhr</small>
              )}
            </div>
          )}

          {isAdmin && (
            <div style={adminSectionStyle}>
              <div style={adminDividerStyle}>ABRECHNUNG & ZUSCHUSS</div>

              {/* Zeile 1: Zuschussgeber und Betrag */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select 
                  value={sponsorUserId} 
                  onChange={(e) => setSponsorUserId(e.target.value)} 
                  style={{ ...selectStyle, border: '1px solid #86efac' }}
                >
                  <option value="">Wer gibt was dazu?</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                </select>
                <input 
                  type="number" 
                  placeholder="Zuschuss €" 
                  value={subsidy} 
                  onChange={(e) => setSubsidy(e.target.value)} 
                  style={{ ...costInputStyle, width: '100px', backgroundColor: '#f0fdf4' }} 
                />
              </div>

              {/* Zeile 2: Einkaufspreis, nur Anzeige aktualisieren & Abschluss */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <input 
                  type="number" 
                  placeholder="Einkauf €" 
                  value={totalCost} 
                  onChange={(e) => setTotalCost(e.target.value)} 
                  style={costInputStyle} 
                />
                <button onClick={saveMealDisplayCost} style={{ ...settleBtnStyle, backgroundColor: '#6366f1' }} title="Nur Kosten-Anzeige pro Person aktualisieren, ohne abzurechnen">
                  Anzeige aktualisieren
                </button>
                <button onClick={settleMeal} style={settleBtnStyle}>Abschließen</button>
              </div>

              <div style={adminDividerStyle}>TEILNEHMER MANUELL</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={selectStyle}>
                  <option value="">Kamerad...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                </select>
                <button onClick={addParticipantAsAdmin} style={addBtnStyle}>+</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showParticipantsPopup && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0 }}>Teilnehmer</h3>
              <button onClick={() => setShowParticipantsPopup(false)} style={closeBtnStyle}>✕</button>
            </div>
            <div style={participantsListStyle}>
              {activeMeal.meal_participants?.map((p, idx) => (
                <div key={'u-' + (p.user_id || idx)} style={participantTagStyle}>
                  {p.profiles?.username}
                  {(isAdmin || (p.user_id === session.user.id && canLeave)) && (
                    <span onClick={() => removeParticipant(p.user_id)} style={removeIconStyle}>✕</span>
                  )}
                </div>
              ))}
              {guestEntries.map(g => (
                <div key={g.id} style={{ ...participantTagStyle, backgroundColor: '#fef3c7', color: '#92400e' }}>
                  <span>{g.guest_name}{g.amount > 0 ? ` (${Number(g.amount).toFixed(2)} €)` : ''}</span>
                  {isAdmin && <span onClick={() => removeGuestEntry(g.id)} style={removeIconStyle}>✕</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// STYLES (Unverändert)
const cardStyle = { backgroundColor: '#fff', padding: '24px', borderRadius: '24px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }
const titleStyle = { margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }
const subtitleStyle = { margin: 0, fontSize: '0.75rem', color: '#94a3b8' }
const emptyStateStyle = { textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.9rem', backgroundColor: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }
const mealHeaderStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }
const mealTitleStyle = { fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', flex: 1 }
const mealBadgeStyle = { backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: '900' }
const deleteBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }
const participantsToggleStyle = { width: '100%', padding: '14px', marginBottom: '12px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '16px', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer' }
const joinBtnStyle = { width: '100%', padding: '16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }
const statusBoxStyle = { textAlign: 'center', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '16px', border: '1px solid #dcfce7' }
const leaveLinkStyle = { background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', marginTop: '4px' }
const adminSectionStyle = { marginTop: '24px', paddingTop: '24px', borderTop: '2px dashed #f1f5f9' }
const adminDividerStyle = { fontSize: '0.65rem', fontWeight: '900', color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px', marginTop: '12px' }
const selectStyle = { flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }
const addBtnStyle = { padding: '0 15px', borderRadius: '12px', border: 'none', backgroundColor: '#f59e0b', color: 'white', fontWeight: 'bold', cursor: 'pointer' }
const costInputStyle = { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }
const settleBtnStyle = { padding: '12px 26px', borderRadius: '12px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer' }
const createBtnStyle = { padding: '6px 14px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }
const modalContentStyle = { backgroundColor: '#fff', width: '90%', maxWidth: '400px', borderRadius: '28px', padding: '24px' }
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }
const closeBtnStyle = { background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '10px', cursor: 'pointer' }
const participantsListStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px' }
const participantTagStyle = { backgroundColor: '#eff6ff', color: '#2563eb', padding: '8px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }
const removeIconStyle = { cursor: 'pointer', opacity: 0.5, fontSize: '0.7rem' }