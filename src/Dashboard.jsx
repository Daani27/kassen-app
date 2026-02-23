import { useEffect, useState, useRef } from 'react'
import { apiGetProfileMe, apiGetTransactions, apiGetActiveMeal, apiGetGlobalExpenses, apiUpdateProfileVersion, apiLogout } from './api'

const APP_VERSION = typeof import.meta.env?.PACKAGE_VERSION === 'string' ? import.meta.env.PACKAGE_VERSION : ''
import Strichliste from './Strichliste'
import Mahlzeiten from './Mahlzeiten'
import AdminPanel from './AdminPanel'
import FinancePanel from './FinancePanel'
import StatsPanel from './StatsPanel'
import Fruehstueck from './Fruehstueck'
import UserManagement from './UserManagement'
import UserSettings from './UserSettings'

const STORAGE_KEY = 'kasse_active_tab'

function getInitialTab() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved && ['home', 'settings', 'finance', 'stats', 'users', 'admin'].includes(saved)) return saved
  } catch (_) {}
  return 'home'
}

const PULL_THRESHOLD = 50
const getScrollRoot = () => document.getElementById('root')

export default function Dashboard({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [balance, setBalance] = useState(0)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mealInfo, setMealInfo] = useState({ count: 0, price: 0, date: null })
  const [mealRefreshKey, setMealRefreshKey] = useState(0)
  const [userTransactions, setUserTransactions] = useState([])
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartYRef = useRef(0)
  const pullYRef = useRef(0)

  useEffect(() => {
    fetchInitialData()
  }, [])

  // Version für Admin-Übersicht aktualisieren
  useEffect(() => {
    if (!session?.user?.id) return
    const version = APP_VERSION || null
    apiUpdateProfileVersion(version).catch((e) => console.warn('Version-Update:', e.message))
  }, [session?.user?.id])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, activeTab)
    } catch (_) {}
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'home') fetchMealInfo()
  }, [activeTab])

  // Pull-to-Refresh auf Startseite
  useEffect(() => {
    if (activeTab !== 'home') return
    const root = getScrollRoot()
    if (!root) return

    function getScrollTop() {
      const el = getScrollRoot()
      return el ? el.scrollTop : 0
    }

    function handleTouchStart(e) {
      touchStartYRef.current = e.touches[0].clientY
      pullYRef.current = 0
      setPullY(0)
    }

    function handleTouchMove(e) {
      const scrollTop = getScrollTop()
      if (scrollTop > 2) return
      const y = e.touches[0].clientY
      const delta = y - touchStartYRef.current
      if (delta > 0) {
        const val = Math.min(delta, 80)
        pullYRef.current = val
        setPullY(val)
      }
    }

    function handleTouchEnd() {
      const currentPull = pullYRef.current
      setPullY(0)
      pullYRef.current = 0
      if (currentPull >= PULL_THRESHOLD && getScrollTop() <= 2) {
        setIsRefreshing(true)
        Promise.all([fetchUserData(), fetchMealInfo()]).finally(() => setIsRefreshing(false))
        if (typeof window.__pwaCheckUpdate === 'function') window.__pwaCheckUpdate()
      }
    }

    root.addEventListener('touchstart', handleTouchStart, { passive: true })
    root.addEventListener('touchmove', handleTouchMove, { passive: true })
    root.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      root.removeEventListener('touchstart', handleTouchStart)
      root.removeEventListener('touchmove', handleTouchMove)
      root.removeEventListener('touchend', handleTouchEnd)
    }
  }, [activeTab])

  async function fetchInitialData() {
    setLoading(true)
    await Promise.all([fetchUserData(), fetchMealInfo()])
    setLoading(false)
  }

  async function fetchUserData() {
    try {
      const profileData = await apiGetProfileMe()
      setProfile(profileData ?? null)

      const allTrans = await apiGetTransactions(session?.user?.id)
      const nonCancelled = (Array.isArray(allTrans) ? allTrans : []).filter((t) => !t.is_cancelled)
      const total = nonCancelled.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
      setBalance(Number.isFinite(total) ? total : 0)
      setUserTransactions(nonCancelled.slice(0, 20))
    } catch (error) {
      console.error('Fehler beim Laden:', error.message)
      setBalance(0)
      setUserTransactions([])
    }
  }

  function getTodayLocal() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function fetchMealInfo() {
    try {
      const todayLocal = getTodayLocal()
      const meal = await apiGetActiveMeal()
      const mealDateStr = meal?.meal_date ? String(meal.meal_date).slice(0, 10) : todayLocal
      // Abendessen-Ausgaben mit lokalem „heute“ abfragen, damit sie mit FinancePanel (getTodayLocal) matchen
      const expenseDate = (meal?.status === 'open') ? todayLocal : mealDateStr
      if (meal) {
        const count = (meal.meal_participants || []).length
        const expenseData = await apiGetGlobalExpenses({ category: 'abendessen', shift_date: expenseDate })
        const autoSum = (expenseData || []).reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0) || 0
        const currentCosts = (meal.status === 'open') ? autoSum : ((meal.total_cost && meal.total_cost > 0) ? meal.total_cost : autoSum)
        const rawPerPerson = count > 0 ? currentCosts / count : 0
        let perPerson = count > 0 ? Math.ceil(rawPerPerson * 2) / 2 : 0
        if (Math.round(rawPerPerson * 100) % 50 === 0) perPerson += 0.5
        setMealInfo({ count, price: perPerson, date: mealDateStr })
      } else {
        setMealInfo({ count: 0, price: 0, date: null })
      }
    } catch (error) {
      console.error('MealInfo Fehler:', error.message)
    }
  }

  // --- Styles ---
  const navContainerStyle = {
    display: 'flex',
    justifyContent: profile?.is_admin ? 'flex-start' : 'center',
    gap: '8px',
    marginBottom: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    padding: '8px',
    borderRadius: '20px',
    position: 'sticky',
    top: '10px',
    zIndex: 100,
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    border: '1px solid rgba(255,255,255,0.3)',
    overflowX: 'auto', // Scrollbar für viele Tabs
    whiteSpace: 'nowrap',
    scrollbarWidth: 'none', // Versteckt Scrollbar Firefox
    msOverflowStyle: 'none' // Versteckt Scrollbar IE/Edge
  }

  const tabButtonStyle = (id) => ({
    padding: '12px 18px',
    border: 'none',
    background: activeTab === id ? '#111827' : 'transparent',
    color: activeTab === id ? '#fff' : '#6b7280',
    borderRadius: '14px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '1.1rem',
    transition: 'all 0.23s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  })

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb', color: '#9ca3af', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🚒</div>
        <p style={{ fontWeight: '500' }}>Wird geladen...</p>
      </div>
    </div>
  )

  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111827' }}>
      <div style={{ maxWidth: '500px', margin: 'auto', padding: '16px' }}>

        {/* Navigation */}
        <nav style={navContainerStyle} className="hide-scrollbar">
          <button onClick={() => setActiveTab('home')} style={tabButtonStyle('home')}>🏠</button>
          <button onClick={() => setActiveTab('settings')} style={tabButtonStyle('settings')}>👤</button>

          {profile?.is_admin && (
            <>
              <div style={{ width: '1px', background: '#e5e7eb', margin: '0 4px', flexShrink: 0 }} />
              <button onClick={() => setActiveTab('finance')} style={tabButtonStyle('finance')}>💰</button>
              <button onClick={() => setActiveTab('stats')} style={tabButtonStyle('stats')}>📊</button>
              <button onClick={() => setActiveTab('admin')} style={tabButtonStyle('admin')}>⚙️</button>
              <button onClick={() => setActiveTab('users')} style={tabButtonStyle('users')}>👥</button>
            </>
          )}
        </nav>

        {activeTab === 'home' && (
          <div style={{ animation: 'fadeIn 0.4s ease-out', position: 'relative' }}>
            {/* Pull-to-Refresh Indikator */}
            {(pullY > 0 || isRefreshing) && (
              <div style={{
                position: 'sticky',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                padding: '10px',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: isRefreshing ? '#059669' : '#6b7280',
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderBottom: '1px solid #e5e7eb',
                margin: '0 -16px 16px -16px',
                paddingLeft: 16,
                paddingRight: 16
              }}>
                {isRefreshing ? 'Aktualisiere…' : pullY >= PULL_THRESHOLD ? 'Loslassen zum Aktualisieren' : 'Ziehen zum Aktualisieren'}
              </div>
            )}
            <header style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Moin, {profile?.username}! 👋</h2>
                <button onClick={() => { fetchInitialData(); if (typeof window.__pwaCheckUpdate === 'function') window.__pwaCheckUpdate(); }} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} title="Daten und App aktualisieren">🔄</button>
              </div>

              {/* Balance Card */}
              <div style={{ 
                background: (Number(balance) || 0) < 0 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                color: 'white', padding: '24px', borderRadius: '24px', marginTop: '20px', 
                boxShadow: (Number(balance) || 0) < 0 ? '0 10px 20px -5px rgba(239, 68, 68, 0.3)' : '0 10px 20px -5px rgba(16, 185, 129, 0.3)', 
                position: 'relative', overflow: 'hidden' 
              }}>
                <div style={{ opacity: 0.1, position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '6rem' }}>💶</div>
                <small style={{ opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1.2px', fontSize: '0.7rem', fontWeight: '700' }}>Aktuelles Guthaben</small>
                <h1 style={{ margin: '4px 0 0 0', fontSize: '2.8rem', fontWeight: '800' }}>{(Number(balance) || 0).toFixed(2)} €</h1>
              </div>

              {/* Meal Info Mini-Panel */}
              {mealInfo.date && (
                <div style={{ 
                  marginTop: '16px', padding: '16px', backgroundColor: '#fff', borderRadius: '20px', 
                  border: '1px solid #e5e7eb', display: 'flex', gap: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
                }}>
                  <div style={{ flex: 1 }}>
                    <small style={{ color: '#9ca3af', display: 'block', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase' }}>Essen heute</small>
                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>👥 {mealInfo.count} Pers.</span>
                  </div>
                  <div style={{ width: '1px', background: '#f3f4f6' }} />
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <small style={{ color: '#9ca3af', display: 'block', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase' }}>Kosten p.P.</small>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: '#059669' }}>
                      {(Number(mealInfo.price) || 0) > 0 ? `${(Number(mealInfo.price) || 0).toFixed(2)} €` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Strichliste session={session} onUpdate={() => { fetchUserData(); fetchMealInfo(); }} isAdmin={profile?.is_admin} />
              <Fruehstueck session={session} onUpdate={fetchUserData} isAdmin={profile?.is_admin} />
              <Mahlzeiten session={session} onUpdate={() => { fetchUserData(); fetchMealInfo(); }} refreshKey={mealRefreshKey} isAdmin={profile?.is_admin} />
            </div>
          </div>
        )}

        {/* Tab-Inhalte */}
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {activeTab === 'settings' && <UserSettings session={session} profile={profile} onUpdate={fetchUserData} transactions={userTransactions} />}
          {activeTab === 'users' && profile?.is_admin && <UserManagement />}
          {activeTab === 'finance' && profile?.is_admin && <FinancePanel session={session} isAdmin={profile?.is_admin} onUpdate={() => { fetchUserData(); fetchMealInfo(); setMealRefreshKey(k => k + 1); }} />}
          {activeTab === 'stats' && profile?.is_admin && <StatsPanel />}
          {activeTab === 'admin' && profile?.is_admin && <AdminPanel session={session} />}
        </div>

        <button onClick={() => { apiLogout(); if (onLogout) onLogout(); }} style={{ marginTop: '48px', width: '100%', color: '#9ca3af', background: 'none', border: 'none', textDecoration: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
          🚪 Konto abmelden
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}