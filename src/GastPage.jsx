import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'

const SEARCH_DEBOUNCE_MS = 400
const MIN_SEARCH_LEN = 2
const PREIS_NORMAL = 2.0
const PREIS_KOERNER = 2.5

function formatMealDate(mealDate) {
  if (mealDate == null) return ''
  const s = String(mealDate).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function GastPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [meal, setMeal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guestName, setGuestName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneAsMember, setDoneAsMember] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [breakfastNormal, setBreakfastNormal] = useState(0)
  const [breakfastKoerner, setBreakfastKoerner] = useState(0)
  const [breakfastSaving, setBreakfastSaving] = useState(false)
  const [attendDinner, setAttendDinner] = useState(true)

  useEffect(() => {
    if (!token.trim()) {
      setLoading(false)
      return
    }
    supabase.rpc('get_meal_for_guest_token', { t: token })
      .then(({ data, error: err }) => {
        setLoading(false)
        if (err) {
          setError('Link konnte nicht geladen werden.')
          return
        }
        setMeal(data)
      })
  }, [token])

  const fetchSuggestions = useCallback(async (name) => {
    const q = (name || '').trim()
    if (q.length < MIN_SEARCH_LEN) {
      setSuggestions([])
      setSuggestionsError('')
      return
    }
    setSuggestionsLoading(true)
    setSuggestionsError('')
    let data = null
    let error = null
    const res = await supabase.rpc('search_profiles_by_name', { name: q })
    data = res.data
    error = res.error
    if (error && data === null) {
      const fallback = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${q}%`)
        .order('username')
        .limit(10)
      if (!fallback.error) {
        data = fallback.data
        error = null
      }
    }
    setSuggestionsLoading(false)
    if (error) {
      setSuggestions([])
      setSuggestionsError(error.message || 'Suche vorübergehend nicht möglich.')
      return
    }
    setSuggestions(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    if (!guestName.trim() || guestName.trim().length < MIN_SEARCH_LEN) {
      setSuggestions([])
      setSelectedProfileId(null)
      setSuggestionsError('')
      return
    }
    const t = setTimeout(() => fetchSuggestions(guestName), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [guestName, fetchSuggestions])

  function selectSuggestion(profile) {
    if (!profile) {
      setSelectedProfileId(null)
      return
    }
    setSelectedProfileId(profile.id)
    setGuestName(profile.username)
    setSuggestions([])
  }

  function selectAsGuest() {
    setSelectedProfileId(null)
    setSuggestions([])
  }

  async function saveBreakfast(normal, koerner) {
    if (selectedProfileId) {
      setBreakfastSaving(true)
      await supabase.rpc('guest_breakfast_order', { t: token, uid: selectedProfileId, normal_count: normal, koerner_count: koerner })
      setBreakfastSaving(false)
    } else if (guestName.trim()) {
      setBreakfastSaving(true)
      await supabase.rpc('guest_breakfast_order_guest', { t: token, gname: guestName.trim(), normal_count: normal, koerner_count: koerner })
      setBreakfastSaving(false)
    }
  }

  async function changeBreakfast(type, delta) {
    const newNormal = type === 'normal' ? Math.max(0, breakfastNormal + delta) : breakfastNormal
    const newKoerner = type === 'koerner' ? Math.max(0, breakfastKoerner + delta) : breakfastKoerner
    setBreakfastNormal(newNormal)
    setBreakfastKoerner(newKoerner)
    if (selectedProfileId || guestName.trim()) {
      await saveBreakfast(newNormal, newKoerner)
    }
  }

  const canOrderBreakfast = !!selectedProfileId || !!guestName.trim()
  const breakfastTotal = (breakfastNormal * PREIS_NORMAL) + (breakfastKoerner * PREIS_KOERNER)

  async function handleSubmit(e) {
    e.preventDefault()
    const name = guestName.trim()
    if (!name) {
      setError('Bitte Namen angeben oder einen Vorschlag wählen.')
      return
    }

    setSubmitting(true)
    setError('')

    if (!attendDinner) {
      setSubmitting(false)
      setDone(true)
      setDoneAsMember(!!selectedProfileId)
      return
    }

    if (selectedProfileId) {
      const { data, error: err } = await supabase.rpc('guest_register_as_member', {
        t: token,
        uid: selectedProfileId
      })
      setSubmitting(false)
      if (err) {
        setError(data?.error || err.message || 'Eintrag fehlgeschlagen.')
        return
      }
      if (data?.ok) {
        setDone(true)
        setDoneAsMember(true)
      } else {
        setError(data?.error || 'Eintrag fehlgeschlagen.')
      }
      return
    }

    const { data, error: err } = await supabase.rpc('guest_register', {
      t: token,
      gname: name,
      amt: 0
    })
    setSubmitting(false)
    if (err) {
      setError(data?.error || err.message || 'Eintrag fehlgeschlagen.')
      return
    }
    if (data?.ok) {
      setDone(true)
      setDoneAsMember(false)
    } else {
      setError(data?.error || 'Eintrag fehlgeschlagen.')
    }
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#64748b', margin: 0 }}>Link wird geladen…</p>
        </div>
      </div>
    )
  }

  if (!token.trim() || (!meal && !error)) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>🔗 Gast-Link</h1>
          <p style={{ color: '#64748b', marginTop: 8 }}>Ungültiger oder fehlender Link. Bitte den Link von der Feuerwehr verwenden.</p>
        </div>
      </div>
    )
  }

  if (error && !meal) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>🔗 Gast-Link</h1>
          <p style={{ color: '#dc2626', marginTop: 8 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (done) {
    const noDinner = !attendDinner
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, borderColor: '#86efac', backgroundColor: '#f0fdf4' }}>
          <h1 style={{ ...titleStyle, color: '#166534' }}>{noDinner ? '✅ Erledigt' : '✅ Du bist eingetragen'}</h1>
          {noDinner ? (
            <p style={{ color: '#15803d', marginTop: 8 }}>Du nimmst nicht am Abendessen teil.{breakfastTotal > 0 ? (doneAsMember ? ' Brötchen wurden vom Konto abgebucht.' : ' Brötchen bitte vor Ort bar bezahlen.') : ''}</p>
          ) : doneAsMember ? (
            <p style={{ color: '#15803d', marginTop: 8 }}>Abendessen wird von deinem Konto abgebucht, sobald abgerechnet wird.{breakfastTotal > 0 ? ' Brötchen wurden bereits vom Konto abgebucht.' : ''}</p>
          ) : (
            <p style={{ color: '#15803d', marginTop: 8 }}>Danke! Bitte den Betrag vor Ort bar bezahlen.{breakfastTotal > 0 ? ' (Brötchen inklusive.)' : ''}</p>
          )}
        </div>
      </div>
    )
  }

  const showSuggestions = suggestions.length > 0 && guestName.trim().length >= MIN_SEARCH_LEN

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>🍴 Als Gast eintragen</h1>

        <div style={{ marginTop: '20px' }}>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            placeholder="Name eingeben (mind. 2 Zeichen)"
            value={guestName}
            onChange={e => { setGuestName(e.target.value); setSelectedProfileId(null) }}
            style={inputStyle}
            autoComplete="name"
          />
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Bei Namenseingabe erscheinen unten passende Nutzer – Auswahl wird vom Konto abgebucht.
          </p>

          {suggestionsLoading && <p style={{ ...hintStyle, marginTop: '12px' }}>Suche…</p>}
          {suggestionsError && <p style={{ ...hintStyle, marginTop: '8px', color: '#dc2626' }}>{suggestionsError}</p>}

          {showSuggestions && !suggestionsLoading && (
            <div style={suggestionsListWrapStyle}>
              <div style={suggestionsListTitleStyle}>Gefunden – bitte wählen:</div>
              <ul style={suggestionsListStyle}>
                {suggestions.map(s => (
                  <li key={s.id} style={suggestionItemStyle}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      style={suggestionItemBtnStyle}
                    >
                      {s.username}
                    </button>
                  </li>
                ))}
                <li style={suggestionItemStyle}>
                  <button type="button" onClick={selectAsGuest} style={suggestionGuestBtnStyle}>
                    Nein, ich bin Gast / Bar zahlen
                  </button>
                </li>
              </ul>
            </div>
          )}

          {selectedProfileId && (
            <p style={{ ...selectedHintStyle, marginTop: '12px' }}>✓ Wird als Nutzer gebucht (vom Konto abgebucht)</p>
          )}
        </div>

        <div style={wasEsGibtStyle}>
          <div style={wasEsGibtLabel}>Was es gibt</div>
          <div style={wasEsGibtTitle}>🍴 Abendessen: {meal?.title}</div>
          <div style={dateStyle}>{formatMealDate(meal?.meal_date)}</div>
          <p style={abendHintStyle}>Zum Abendessen anmelden: Betrag wird bei Abrechnung vom Konto abgebucht.</p>
          <div style={dinnerChoiceWrapStyle}>
            <span style={dinnerChoiceLabelStyle}>Am Abendessen teilnehmen?</span>
            <div style={dinnerChoiceBtnWrapStyle}>
              <button type="button" onClick={() => setAttendDinner(true)} style={attendDinner ? dinnerChoiceBtnActiveStyle : dinnerChoiceBtnStyle}>Ja</button>
              <button type="button" onClick={() => setAttendDinner(false)} style={!attendDinner ? dinnerChoiceBtnActiveStyle : dinnerChoiceBtnStyle}>Nein</button>
            </div>
          </div>
        </div>

        <div style={breakfastSectionStyle}>
          <div style={breakfastTitleStyle}>☕ Brötchen (Frühstück)</div>
          <p style={breakfastHintStyle}>Zuerst oben Namen eingeben.</p>
          <div style={breakfastRowStyle}>
            <span style={breakfastLabelStyle}>Normal (2 €)</span>
            <div style={stepperWrapStyle}>
              <button type="button" onClick={() => changeBreakfast('normal', -1)} disabled={!canOrderBreakfast || breakfastNormal <= 0} style={stepperBtnStyle(!canOrderBreakfast || breakfastNormal <= 0)}>−</button>
              <span style={stepperCountStyle}>{breakfastNormal}</span>
              <button type="button" onClick={() => changeBreakfast('normal', 1)} disabled={!canOrderBreakfast} style={stepperBtnStyle(!canOrderBreakfast)}>+</button>
            </div>
          </div>
          <div style={breakfastRowStyle}>
            <span style={breakfastLabelStyle}>Körner (2,50 €)</span>
            <div style={stepperWrapStyle}>
              <button type="button" onClick={() => changeBreakfast('koerner', -1)} disabled={!canOrderBreakfast || breakfastKoerner <= 0} style={stepperBtnStyle(!canOrderBreakfast || breakfastKoerner <= 0)}>−</button>
              <span style={stepperCountStyle}>{breakfastKoerner}</span>
              <button type="button" onClick={() => changeBreakfast('koerner', 1)} disabled={!canOrderBreakfast} style={stepperBtnStyle(!canOrderBreakfast)}>+</button>
            </div>
          </div>
          {breakfastSaving && <p style={hintStyle}>Wird gespeichert…</p>}
          {canOrderBreakfast && breakfastTotal > 0 && <p style={selectedHintStyle}>Gesamt Brötchen: {breakfastTotal.toFixed(2)} €</p>}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
          {error && <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={submitBtnStyle}>
            {submitting ? 'Wird gesendet…' : attendDinner ? 'Zum Abendessen eintragen' : 'Nur bestätigen (ohne Abendessen)'}
          </button>
        </form>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: '#f1f5f9',
  padding: '24px 16px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center'
}

const cardStyle = {
  width: '100%',
  maxWidth: '400px',
  backgroundColor: '#fff',
  padding: '28px',
  borderRadius: '24px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
}

const titleStyle = { margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }
const mealTitleStyle = { margin: '8px 0 0 0', fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }
const dateStyle = { margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }
const hintStyle = { fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0 0' }
const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  fontSize: '1rem',
  boxSizing: 'border-box'
}

const suggestionsListWrapStyle = {
  marginTop: '14px',
  padding: '14px 16px',
  backgroundColor: '#f8fafc',
  borderRadius: '12px',
  border: '1px solid #e2e8f0'
}
const suggestionsListTitleStyle = { fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '10px' }
const suggestionsListStyle = { listStyle: 'none', margin: 0, padding: 0 }
const suggestionItemStyle = { marginBottom: '6px' }
const suggestionItemBtnStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  textAlign: 'left',
  backgroundColor: '#eff6ff',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: '600'
}
const suggestionGuestBtnStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  textAlign: 'left',
  backgroundColor: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fde68a',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: '600'
}
const selectedHintStyle = { fontSize: '0.8rem', color: '#15803d', margin: '6px 0 0 0', fontWeight: '600' }
const submitBtnStyle = {
  padding: '16px',
  backgroundColor: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '14px',
  fontWeight: '700',
  fontSize: '1rem',
  cursor: 'pointer'
}

const wasEsGibtStyle = { marginTop: '16px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }
const wasEsGibtLabel = { fontSize: '0.65rem', fontWeight: '800', color: '#0284c7', letterSpacing: '0.5px', marginBottom: '4px' }
const wasEsGibtTitle = { fontSize: '1.05rem', fontWeight: '800', color: '#0c4a6e' }
const abendHintStyle = { fontSize: '0.75rem', color: '#0369a1', margin: '8px 0 0 0', lineHeight: 1.4 }
const breakfastSectionStyle = { marginTop: '20px', padding: '16px', backgroundColor: '#fefce8', borderRadius: '16px', border: '1px solid #fef08a' }
const breakfastTitleStyle = { fontSize: '0.95rem', fontWeight: '800', color: '#854d0e', margin: '0 0 6px 0' }
const breakfastHintStyle = { fontSize: '0.75rem', color: '#a16207', margin: '0 0 12px 0' }
const breakfastRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }
const breakfastLabelStyle = { fontSize: '0.9rem', fontWeight: '600', color: '#713f12' }
const stepperWrapStyle = { display: 'flex', alignItems: 'center', gap: '10px' }
const stepperBtnStyle = (disabled) => ({
  width: '40px', height: '40px', borderRadius: '12px', border: 'none',
  backgroundColor: disabled ? '#f3f4f6' : '#fef08a', color: disabled ? '#9ca3af' : '#713f12',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '1.2rem', fontWeight: '600'
})
const stepperCountStyle = { minWidth: '24px', textAlign: 'center', fontWeight: '700', fontSize: '1rem' }
const dinnerChoiceWrapStyle = { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #bae6fd' }
const dinnerChoiceLabelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#0369a1', marginBottom: '8px' }
const dinnerChoiceBtnWrapStyle = { display: 'flex', gap: '10px' }
const dinnerChoiceBtnStyle = { flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #bae6fd', backgroundColor: '#fff', color: '#64748b', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }
const dinnerChoiceBtnActiveStyle = { flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid #0284c7', backgroundColor: '#0ea5e9', color: '#fff', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }