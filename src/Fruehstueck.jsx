import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

const SAVE_DEBOUNCE_MS = 500

export default function Fruehstueck({ session, isAdmin, onUpdate }) {
  const [counts, setCounts] = useState({ normal: 0, koerner: 0 })
  const [loading, setLoading] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef(null)
  const countsRef = useRef({ normal: 0, koerner: 0 })
  countsRef.current = counts

  // States für Admin-Funktion
  const [profiles, setProfiles] = useState([])
  const [targetUserId, setTargetUserId] = useState(session?.user?.id)

  const PREIS_NORMAL = 2.00
  const PREIS_KOERNER = 2.50

  useEffect(() => {
    const init = async () => {
      checkLockStatus()
      if (isAdmin) await fetchProfiles()
      setLoading(false)
    }
    init()
    const timer = setInterval(checkLockStatus, 60000)
    return () => clearInterval(timer)
  }, [isAdmin])

  useEffect(() => {
    if (targetUserId) {
      fetchOrderForUser(targetUserId)
    }
  }, [targetUserId])

  function checkLockStatus() {
    const now = new Date()
    // Sperre ab 10:00 Uhr
    setIsLocked(now.getHours() >= 10) 
  }

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('id, username').order('username')
    if (data) setProfiles(data)
  }

  async function fetchOrderForUser(userId) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('fruehstueck_orders')
        .select('normal_count, koerner_count')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle()

      if (data) {
        setCounts({ 
          normal: data.normal_count || 0, 
          koerner: data.koerner_count || 0 
        })
      } else {
        setCounts({ normal: 0, koerner: 0 })
      }
    } catch (e) {
      console.error("Ladefehler:", e)
    }
  }

  async function persistOrder(toSave) {
    if (!toSave || saving) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const totalAmount = (toSave.normal * PREIS_NORMAL) + (toSave.koerner * PREIS_KOERNER)

      const { error: orderError } = await supabase
        .from('fruehstueck_orders')
        .upsert({
          user_id: targetUserId,
          date: today,
          normal_count: toSave.normal,
          koerner_count: toSave.koerner,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, date' })
      if (orderError) throw orderError

      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', targetUserId)
        .eq('category', 'breakfast')
        .gte('created_at', today)
      if (deleteError) throw deleteError

      if (totalAmount > 0) {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert([{
            user_id: targetUserId,
            amount: -totalAmount,
            description: `Frühstück: ${toSave.normal}x Normal, ${toSave.koerner}x Körner`,
            category: 'breakfast'
          }])
        if (insertError) throw insertError
      }
      if (onUpdate) onUpdate()
    } catch (e) {
      console.error('Speicherfehler:', e)
      fetchOrderForUser(targetUserId)
      alert('Fehler beim Speichern: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  function updateOrder(type, delta) {
    if (isLocked && !isAdmin) return

    const newCounts = { ...counts, [type]: Math.max(0, (counts[type] || 0) + delta) }
    setCounts(newCounts)

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      persistOrder(countsRef.current)
    }, SAVE_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [])

  const isInteractionDisabled = isLocked && !isAdmin
  const isStepperDisabled = isInteractionDisabled || loading || saving

  const stepperBtnStyle = (disabled) => ({
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: 'none',
    backgroundColor: disabled ? '#f3f4f6' : '#f9fafb',
    color: disabled ? '#d1d5db' : '#111827',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '1.4rem',
    fontWeight: '600',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: disabled ? 'none' : 'inset 0 -2px 0 rgba(0,0,0,0.05)'
  })

  const isExternal = isAdmin && targetUserId !== session?.user?.id;

  return (
    <div style={{...containerStyle, borderColor: isExternal ? '#3b82f6' : '#f3f4f6'}}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={titleStyle}>☕ Frühstück</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>Bestellung für heute</p>
          </div>
          <div style={{
            fontSize: '0.65rem',
            padding: '6px 10px',
            borderRadius: '10px',
            fontWeight: '800',
            backgroundColor: isLocked ? '#fee2e2' : '#dcfce7',
            color: isLocked ? '#ef4444' : '#10b981',
          }}>
            {isLocked ? '🔒 STOPP' : '🔓 BIS 10:00'}
          </div>
        </div>

        {/* ADMIN USER-AUSWAHL */}
        {isAdmin && (
          <div style={adminBoxStyle}>
            <label style={adminLabelStyle}>🎯 Bestellung für:</label>
            <select 
              value={targetUserId} 
              onChange={(e) => setTargetUserId(e.target.value)}
              style={selectStyle}
            >
              <option value={session?.user?.id}>-- Mich selbst --</option>
              {profiles.filter(p => p.id !== session?.user?.id).map(p => (
                <option key={p.id} value={p.id}>{p.username}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{...rowStyle, backgroundColor: isExternal ? '#eff6ff' : '#f9fafb'}}>
          <div>
            <div style={itemTitleStyle}>Normales Brötchen</div>
            <div style={priceStyle}>{PREIS_NORMAL.toFixed(2)} €</div>
          </div>
          <div style={stepperContainerStyle}>
            <button onClick={() => updateOrder('normal', -1)} disabled={isStepperDisabled} style={stepperBtnStyle(isStepperDisabled)} aria-busy={saving}>−</button>
            <span style={countStyle}>{counts.normal}{saving ? ' …' : ''}</span>
            <button onClick={() => updateOrder('normal', 1)} disabled={isStepperDisabled} style={stepperBtnStyle(isStepperDisabled)} aria-busy={saving}>+</button>
          </div>
        </div>

        <div style={{...rowStyle, backgroundColor: isExternal ? '#eff6ff' : '#f9fafb'}}>
          <div>
            <div style={itemTitleStyle}>Körner-Brötchen</div>
            <div style={priceStyle}>{PREIS_KOERNER.toFixed(2)} €</div>
          </div>
          <div style={stepperContainerStyle}>
            <button onClick={() => updateOrder('koerner', -1)} disabled={isStepperDisabled} style={stepperBtnStyle(isStepperDisabled)} aria-busy={saving}>−</button>
            <span style={countStyle}>{counts.koerner}{saving ? ' …' : ''}</span>
            <button onClick={() => updateOrder('koerner', 1)} disabled={isStepperDisabled} style={stepperBtnStyle(isStepperDisabled)} aria-busy={saving}>+</button>
          </div>
        </div>
      </div>

      <div style={footerStyle}>
        <span style={{ fontSize: '0.85rem', color: isExternal ? '#3b82f6' : '#6b7280', fontWeight: '700' }}>
          {isExternal ? 'Wert für Nutzer:' : 'Dein Gesamtwert:'}
        </span>
        <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#111827' }}>
          {((counts.normal * PREIS_NORMAL) + (counts.koerner * PREIS_KOERNER)).toFixed(2)} €
        </span>
      </div>
    </div>
  )
}

// STYLES
const containerStyle = { padding: '24px', backgroundColor: '#fff', borderRadius: '24px', border: '1px solid', transition: 'all 0.2s' }
const titleStyle = { margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#111827' }
const adminBoxStyle = { marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }
const adminLabelStyle = { fontSize: '0.65rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }
const selectStyle = { width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '0.9rem', fontWeight: '600' }
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '20px', transition: 'all 0.2s' }
const itemTitleStyle = { fontWeight: '700', fontSize: '0.9rem', color: '#374151' }
const priceStyle = { fontSize: '0.75rem', color: '#9ca3af', fontWeight: '500' }
const stepperContainerStyle = { display: 'flex', alignItems: 'center', gap: '12px' }
const countStyle = { fontWeight: '800', fontSize: '1.3rem', minWidth: '28px', textAlign: 'center', color: '#111827' }
const footerStyle = { marginTop: '16px', paddingTop: '16px', borderTop: '2px dashed #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }