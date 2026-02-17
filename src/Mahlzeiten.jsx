import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
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
    const { data: { session } } = await supabase.auth.refreshSession()
    if (session) sendPushToAll(title, body, session)
  }

  async function checkAdminStatus() {
    try {
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
      if (data) setIsAdmin(data.is_admin)
    } catch (e) { console.error(e) }
  }

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('id, username').order('username')
    if (data) setProfiles(data)
  }

  async function fetchActiveMeal() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meals')
        .select(`*, meal_participants(user_id, profiles(username))`)
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        const meal = data[0];
        setActiveMeal(meal)
        setIsJoined(meal.meal_participants.some(p => p.user_id === session.user.id))

        const { data: guests } = await supabase
          .from('meal_guest_entries')
          .select('id, guest_name, amount, created_at')
          .eq('meal_id', meal.id)
          .order('created_at', { ascending: true })
        setGuestEntries(guests || [])

        const { data: expenses } = await supabase
          .from('global_expenses')
          .select('amount')
          .eq('shift_date', meal.meal_date)
          .eq('category', 'abendessen')
          .eq('is_cancelled', false)

        if (expenses && expenses.length > 0) {
          const sum = expenses.reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0)
          setTotalCost(sum.toString())
        }
      } else { setActiveMeal(null); setGuestEntries([]) }
    } catch (e) { console.error("Fehler: " + e.message) }
    setLoading(false)
  }

  async function removeGuestEntry(entryId) {
    if (!window.confirm('Gästeeintrag wirklich entfernen?')) return
    const { error } = await supabase.from('meal_guest_entries').delete().eq('id', entryId)
    if (!error) { fetchActiveMeal(); if (onUpdate) onUpdate() }
    else alert('Fehler: ' + error.message)
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

      const { error: transError } = await supabase.from('transactions').insert(allTransactions);
      if (transError) throw transError;

      const { error: mealError } = await supabase.from('meals').update({ 
        status: 'closed', 
        total_cost: cost, 
        cost_per_person: ppp 
      }).eq('id', activeMeal.id);
      if (mealError) throw mealError;

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
    if (activeMeal.meal_participants.some(p => p.user_id === session.user.id)) return;
    await supabase.from('meal_participants').insert([{ meal_id: activeMeal.id, user_id: session.user.id }])
    fetchActiveMeal()
    if (onUpdate) onUpdate();
  }

  async function addParticipantAsAdmin() {
    if (!targetUserId) return alert("Bitte wähle einen Kameraden aus.");
    try {
      await supabase.from('meal_participants').insert([{ meal_id: activeMeal.id, user_id: targetUserId }]);
      setTargetUserId('');
      fetchActiveMeal();
      if (onUpdate) onUpdate();
    } catch (e) { alert("Fehler: " + e.message); }
  }

  async function leaveMeal() { await removeParticipant(session.user.id); }

  async function removeParticipant(participantUserId) {
    try {
      await supabase.from('meal_participants').delete().eq('meal_id', activeMeal.id).eq('user_id', participantUserId);
      fetchActiveMeal();
      if (onUpdate) onUpdate();
    } catch (e) { alert("Fehler: " + e.message); }
  }

  async function createMeal() {
    const title = window.prompt("Was gibt es zu essen?")
    if (!title) return
    const { error } = await supabase.from('meals').insert([{ title, meal_date: new Date().toISOString().split('T')[0], created_by: session.user.id, status: 'open' }])
    if (!error) {
      broadcastPush('Neue Mahlzeit', `Heute gibt es: ${title}. Tragt euch bitte in der App ein!`)
      fetchActiveMeal()
    }
  }

  async function deleteMeal() {
    if (!window.confirm(`Liste "${activeMeal.title}" wirklich löschen?`)) return;
    try {
      await supabase.from('meal_participants').delete().eq('meal_id', activeMeal.id);
      await supabase.from('meals').delete().eq('id', activeMeal.id);
      setActiveMeal(null);
      fetchActiveMeal();
      if (onUpdate) onUpdate();
    } catch (e) { alert("Fehler: " + e.message); }
  }

  function notifyAlmostReady() {
    if (!activeMeal) return
    if (window.confirm("Möchtest du die 'Fast fertig'-Meldung senden?")) {
      broadcastPush('Essen fast fertig', `Das Essen (${activeMeal.title}) steht in ca. 5–10 Minuten auf dem Tisch.`)
    }
  }

  function notifyReady() {
    if (!activeMeal) return
    if (window.confirm("Soll die 'Essen ist fertig!'-Meldung gesendet werden?")) {
      broadcastPush('Essen ist fertig!', `Kommt in die Küche – ${activeMeal.title} ist serviert!`)
    }
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
              <div style={adminDividerStyle}>RUF-FUNKTIONEN</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button onClick={notifyAlmostReady} style={almostReadyBtnStyle}>⏳ Fast fertig</button>
                <button onClick={notifyReady} style={readyBtnStyle}>🔔 Essen fertig!</button>
              </div>

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

              {/* Zeile 2: Einkaufspreis & Abschluss */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input 
                  type="number" 
                  placeholder="Einkauf €" 
                  value={totalCost} 
                  onChange={(e) => setTotalCost(e.target.value)} 
                  style={costInputStyle} 
                />
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
const settleBtnStyle = { padding: '0 20px', borderRadius: '12px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 'bold', cursor: 'pointer' }
const createBtnStyle = { padding: '6px 14px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }
const almostReadyBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }
const readyBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }
const modalContentStyle = { backgroundColor: '#fff', width: '90%', maxWidth: '400px', borderRadius: '28px', padding: '24px' }
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }
const closeBtnStyle = { background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '10px', cursor: 'pointer' }
const participantsListStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px' }
const participantTagStyle = { backgroundColor: '#eff6ff', color: '#2563eb', padding: '8px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }
const removeIconStyle = { cursor: 'pointer', opacity: 0.5, fontSize: '0.7rem' }