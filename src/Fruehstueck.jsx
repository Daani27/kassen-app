import { useState, useEffect, useRef } from 'react'
import { apiGetProfiles, apiGetFruehstueckOrder, apiUpsertFruehstueckOrder } from './api'
import { cardStyle as themeCard, sectionTitleStyle as themeTitle, sectionSubtitleStyle as themeSubtitle, labelStyle as themeLabel, selectStyle as themeSelect } from './uiTheme'

const SAVE_DEBOUNCE_MS = 500
const SAVE_DEBOUNCE_MS_IOS = 900

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function Fruehstueck({ session, isAdmin, onUpdate }) {
  const [counts, setCounts] = useState({ normal: 0, koerner: 0 })
  const [loading, setLoading] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef(null)
  const countsRef = useRef({ normal: 0, koerner: 0 })
  const savingRef = useRef(false)
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
    // Sperre ab 7:50 Uhr
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
    setIsLocked(minutesSinceMidnight >= 7 * 60 + 50) 
  }

  async function fetchProfiles() {
    try {
      const data = await apiGetProfiles()
      if (data) setProfiles(data)
    } catch (_) {}
  }

  async function fetchOrderForUser(userId) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const data = await apiGetFruehstueckOrder(today, userId)
      if (data) {
        setCounts({
          normal: data.normal_count || 0,
          koerner: data.koerner_count || 0,
        })
      } else {
        setCounts({ normal: 0, koerner: 0 })
      }
    } catch (e) {
      console.error('Ladefehler:', e)
    }
  }

  async function persistOrder(toSave) {
    if (!toSave || savingRef.current) return
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    savingRef.current = true
    setSaving(true)
    const savedSnapshot = { ...toSave }
    try {
      const today = new Date().toISOString().split('T')[0]
      // Wichtig: Zuerst alle Frühstücks-Buchungen von heute löschen (RLS erlaubt Nutzern eigenes „breakfast“ von heute).
      // Sonst entstehen Mehrfachbuchungen, wenn man später noch ein Brötchen dazu bucht.
      await apiUpsertFruehstueckOrder({
        user_id: targetUserId,
        date: today,
        normal_count: toSave.normal,
        koerner_count: toSave.koerner,
      })
      if (onUpdate) onUpdate()
    } catch (e) {
      console.error('Speicherfehler:', e)
      fetchOrderForUser(targetUserId)
      alert('Fehler beim Speichern: ' + (e.message || e))
    } finally {
      savingRef.current = false
      setSaving(false)
      const current = countsRef.current
      const changed = current.normal !== savedSnapshot.normal || current.koerner !== savedSnapshot.koerner
      if (changed) {
        saveTimeoutRef.current = setTimeout(() => {
          saveTimeoutRef.current = null
          persistOrder({ ...countsRef.current })
        }, 50)
      }
    }
  }

  function updateOrder(type, delta) {
    if (isLocked && !isAdmin) return
    if (savingRef.current) return

    const newCounts = { ...counts, [type]: Math.max(0, (counts[type] || 0) + delta) }
    setCounts(newCounts)

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    const debounceMs = isIos() ? SAVE_DEBOUNCE_MS_IOS : SAVE_DEBOUNCE_MS
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      const toSave = { ...countsRef.current }
      persistOrder(toSave)
    }, debounceMs)
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
    <div style={{ ...themeCard, borderWidth: 2, borderColor: isExternal ? '#3b82f6' : '#e5e7eb' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={themeTitle}>☕ Frühstück</h3>
            <p style={themeSubtitle}>Bestellung für heute</p>
          </div>
          <div style={{
            fontSize: '0.65rem',
            padding: '6px 10px',
            borderRadius: 10,
            fontWeight: 800,
            backgroundColor: isLocked ? '#fee2e2' : '#dcfce7',
            color: isLocked ? '#ef4444' : '#10b981',
          }}>
            {isLocked ? '🔒 STOPP' : '🔓 BIS 7:50'}
          </div>
        </div>

        {isAdmin && (
          <div style={adminBoxStyle}>
            <label style={themeLabel}>🎯 Bestellung für</label>
            <select 
              value={targetUserId} 
              onChange={(e) => setTargetUserId(e.target.value)}
              style={themeSelect}
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

const adminBoxStyle = { marginTop: 16, padding: 14, backgroundColor: '#f8fafc', borderRadius: 14, border: '1px solid #e5e7eb' }
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '20px', transition: 'all 0.2s' }
const itemTitleStyle = { fontWeight: '700', fontSize: '0.9rem', color: '#374151' }
const priceStyle = { fontSize: '0.75rem', color: '#9ca3af', fontWeight: '500' }
const stepperContainerStyle = { display: 'flex', alignItems: 'center', gap: '12px' }
const countStyle = { fontWeight: '800', fontSize: '1.3rem', minWidth: '28px', textAlign: 'center', color: '#111827' }
const footerStyle = { marginTop: '16px', paddingTop: '16px', borderTop: '2px dashed #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }