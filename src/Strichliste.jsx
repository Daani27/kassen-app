import { useEffect, useState, useRef } from 'react'
import { apiGetProducts, apiGetProfiles, apiInsertTransaction } from './api'
import { cardStyle as themeCard, sectionTitleStyle as themeTitle, sectionSubtitleStyle as themeSubtitle, labelStyle as themeLabel, selectStyle as themeSelect } from './uiTheme'

export default function Strichliste({ session, onUpdate, isAdmin }) {
  const [products, setProducts] = useState([])
  const [profiles, setProfiles] = useState([])
  const [targetUserId, setTargetUserId] = useState(session.user.id)
  const [loading, setLoading] = useState(true)
  const [bookingProductId, setBookingProductId] = useState(null)
  const bookingLockRef = useRef(false)

  useEffect(() => {
    fetchProducts()
    if (isAdmin) fetchProfiles()
  }, [isAdmin])

  async function fetchProducts() {
    try {
      const data = await apiGetProducts()
      setProducts(data || [])
    } catch (_) {}
    setLoading(false)
  }

  async function fetchProfiles() {
    try {
      const data = await apiGetProfiles()
      if (data) setProfiles(data)
    } catch (_) {}
  }

  async function buyProduct(product) {
    if (bookingLockRef.current || bookingProductId) return
    const rawPrice = parseFloat(product.price);
    if (isNaN(rawPrice)) {
      alert("Fehler: Ungültiger Preis.");
      return;
    }

    const finalAmount = Math.abs(rawPrice) * -1;
    const isForMe = targetUserId === session.user.id;
    const targetProfile = profiles.find(p => p.id === targetUserId);
    const targetName = !isForMe && targetProfile ? targetProfile.username : 'dich selbst';

    const confirmBuy = window.confirm(`${product.name} für ${targetName} (${Math.abs(finalAmount).toFixed(2)}€) buchen?`);
    if (!confirmBuy) return;

    bookingLockRef.current = true
    setBookingProductId(product.id)
    try {
      await apiInsertTransaction({
        user_id: targetUserId,
        amount: finalAmount,
        description: product.name,
        category: 'snack',
      })
      if (onUpdate) onUpdate()
    } catch (e) {
      alert('Fehler: ' + (e.data?.error || e.message))
    } finally {
      bookingLockRef.current = false
      setBookingProductId(null)
    }
  }

  return (
    <div style={{ ...themeCard, marginTop: 0 }}>
      <header style={{ marginBottom: 20 }}>
        <h3 style={themeTitle}>🥤 Snacks und Getränke</h3>
        <p style={themeSubtitle}>Einfach anklicken zum Buchen</p>
      </header>

      {isAdmin && (
        <div style={adminBoxStyle}>
          <label style={themeLabel}>🎯 Buchung für</label>
          <select 
            value={targetUserId} 
            onChange={(e) => setTargetUserId(e.target.value)}
            style={themeSelect}
          >
            <option value={session.user.id}>-- Mich selbst --</option>
            {profiles.filter(p => p.id !== session.user.id).map(p => (
              <option key={p.id} value={p.id}>{p.username}</option>
            ))}
          </select>
        </div>
      )}

      <div style={gridStyle}>
        {loading ? (
          <div style={loadingStyle}>Produkte werden geladen...</div>
        ) : (
          products.map(p => {
            const isExternal = isAdmin && targetUserId !== session.user.id;
            const isBooking = bookingProductId === p.id;
            const isDisabled = !!bookingProductId;
            return (
              <button 
                key={p.id} 
                onClick={() => buyProduct(p)}
                disabled={isDisabled}
                style={{
                  ...tileStyle,
                  backgroundColor: isExternal ? '#eff6ff' : '#fff',
                  borderColor: isExternal ? '#3b82f6' : '#f1f5f9',
                  opacity: isDisabled ? 0.7 : 1,
                  cursor: isDisabled ? 'wait' : 'pointer'
                }}
              >
                <span style={emojiStyle}>{getEmoji(p.name)}</span>
                <span style={productNameStyle}>
                  {isBooking ? 'Buchung läuft…' : p.name}
                </span>
                <span style={{
                  ...priceBadgeStyle,
                  backgroundColor: isExternal ? '#3b82f6' : '#111827',
                  color: '#fff'
                }}>
                  {isBooking ? '…' : `${(Math.abs(Number(p.price)) || 0).toFixed(2)} €`}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// Hilfsfunktion für Icons (optional, wertet es aber extrem auf)
function getEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes('wasser') || n.includes('sprudel')) return '💧';
  if (n.includes('cola') || n.includes('spezi') || n.includes('limo')) return '🥤';
  if (n.includes('bier') || n.includes('radler')) return '🍺';
  if (n.includes('kaffee')) return '☕';
  if (n.includes('eis') || n.includes('stiel') || n.includes('waffel')) return '🍦';
  if (n.includes('schoko') || n.includes('riegel') || n.includes('snack')) return '🍫';
  if (n.includes('apfel') || n.includes('saft')) return '🧃';
  return '📦';
}

const adminBoxStyle = { 
  marginBottom: 20, 
  padding: 14, 
  backgroundColor: '#f8fafc', 
  borderRadius: 14,
  border: '1px solid #e5e7eb'
}

const gridStyle = { 
  display: 'grid', 
  gridTemplateColumns: 'repeat(2, 1fr)', 
  gap: '12px' 
}

const tileStyle = {
  padding: '20px 10px',
  borderRadius: '20px',
  border: '2px solid',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  transition: 'all 0.1s active',
}

const emojiStyle = { fontSize: '1.8rem' }
const productNameStyle = { fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', textAlign: 'center' }
const priceBadgeStyle = { 
  padding: '4px 10px', 
  borderRadius: '8px', 
  fontSize: '0.75rem', 
  fontWeight: '800' 
}

const loadingStyle = { gridColumn: 'span 2', textAlign: 'center', padding: '40px', color: '#94a3b8' }