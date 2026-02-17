import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function GuestManager() {
  const [guestName, setGuestName] = useState('')
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchGuests()
  }, [])

  async function fetchGuests() {
    // Wir suchen nach Profilen, die keinen Auth-Link haben oder als Gast markiert sind
    // Hier nehmen wir zur Einfachheit alle Profile, die mit "Gast:" beginnen
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', 'Gast:%')

    setGuests(data || [])
  }

  async function createGuest() {
    if (!guestName) return
    setLoading(true)

    // Wir generieren eine zufällige ID, da kein Auth-User existiert
    const guestId = crypto.randomUUID() 

    try {
      const { error } = await supabase.from('profiles').insert([{
        id: guestId,
        username: `Gast: ${guestName}`,
        is_admin: false,
        // Hier können weitere Standardwerte für Gäste rein
      }])

      if (error) throw error

      setGuestName('')
      fetchGuests()
      alert(`Gast-Konto für ${guestName} wurde angelegt.`)
    } catch (err) {
      alert("Fehler beim Anlegen: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>👥 Gäste-Verwaltung</h3>
      <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
        Gäste haben keinen Login, können aber in Listen ausgewählt werden.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <input 
          type="text" 
          placeholder="Name des Gastes" 
          value={guestName} 
          onChange={e => setGuestName(e.target.value)} 
          style={inputStyle}
        />
        <button onClick={createGuest} disabled={loading} style={btnStyle}>
          Anlegen
        </button>
      </div>

      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
        {guests.map(g => (
          <div key={g.id} style={guestRowStyle}>
            <span>{g.username}</span>
            <small style={{ color: '#9ca3af' }}>ID: {g.id.slice(0,8)}...</small>
          </div>
        ))}
      </div>
    </div>
  )
}

const cardStyle = { backgroundColor: 'white', padding: '15px', borderRadius: '15px', border: '1px solid #e5e7eb', marginTop: '20px' }
const inputStyle = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db' }
const btnStyle = { padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
const guestRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }