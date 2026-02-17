import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Strichliste from './Strichliste'
import Mahlzeiten from './Mahlzeiten'
import AdminPanel from './AdminPanel'
import FinancePanel from './FinancePanel'
import StatsPanel from './StatsPanel'
import Fruehstueck from './Fruehstueck'
import UserManagement from './UserManagement'
import UserSettings from './UserSettings'

const STORAGE_KEY = 'wa1kasse_active_tab'

function getInitialTab() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved && ['home', 'settings', 'finance', 'stats', 'users', 'admin'].includes(saved)) return saved
  } catch (_) {}
  return 'home'
}

export default function Dashboard({ session }) {
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [balance, setBalance] = useState(0)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mealInfo, setMealInfo] = useState({ count: 0, price: 0, date: null })
  const [userTransactions, setUserTransactions] = useState([])

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, activeTab)
    } catch (_) {}
  }, [activeTab])

  async function fetchInitialData() {
    setLoading(true)
    await Promise.all([fetchUserData(), fetchMealInfo()])
    setLoading(false)
  }

  async function fetchUserData() {
    try {
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(profileData)

      const { data: allTrans } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', session.user.id)
        .eq('is_cancelled', false)

      const total = (allTrans || []).reduce((acc, curr) => acc + Number(curr.amount), 0)
      setBalance(total)

      const { data: recentTrans } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_cancelled', false)
        .order('created_at', { ascending: false })
        .limit(20)

      setUserTransactions(recentTrans || [])
    } catch (error) {
      console.error("Fehler beim Laden:", error.message)
    }
  }

  async function fetchMealInfo() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: meal } = await supabase
        .from('meals')
        .select('*')
        .eq('status', 'open')
        .gte('meal_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (meal) {
        const { count } = await supabase
          .from('meal_participants')
          .select('*', { count: 'exact', head: true })
          .eq('meal_id', meal.id)

        const { data: expenseData } = await supabase
          .from('global_expenses')
          .select('amount')
          .eq('category', 'abendessen')
          .eq('shift_date', meal.meal_date)
          .eq('is_cancelled', false)

        const autoSum = expenseData?.reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0) || 0
        const currentCosts = (meal.total_cost && meal.total_cost > 0) ? meal.total_cost : autoSum
        const rawPerPerson = count > 0 ? currentCosts / count : 0
        let perPerson = count > 0 ? Math.ceil(rawPerPerson * 2) / 2 : 0
        if (Math.round(rawPerPerson * 100) % 50 === 0) perPerson += 0.5 // nur bei exakt ,00 oder ,50

        setMealInfo({ count: count || 0, price: perPerson, date: meal.meal_date })
      } else {
        setMealInfo({ count: 0, price: 0, date: null })
      }
    } catch (error) {
      console.error("MealInfo Fehler:", error.message)
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
          <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <header style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Moin, {profile?.username}! 👋</h2>
                <button onClick={() => { fetchInitialData(); if (typeof window.__pwaCheckUpdate === 'function') window.__pwaCheckUpdate(); }} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} title="Daten und App aktualisieren">🔄</button>
              </div>

              {/* Balance Card */}
              <div style={{ 
                background: balance < 0 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                color: 'white', padding: '24px', borderRadius: '24px', marginTop: '20px', 
                boxShadow: balance < 0 ? '0 10px 20px -5px rgba(239, 68, 68, 0.3)' : '0 10px 20px -5px rgba(16, 185, 129, 0.3)', 
                position: 'relative', overflow: 'hidden' 
              }}>
                <div style={{ opacity: 0.1, position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '6rem' }}>💶</div>
                <small style={{ opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1.2px', fontSize: '0.7rem', fontWeight: '700' }}>Aktuelles Guthaben</small>
                <h1 style={{ margin: '4px 0 0 0', fontSize: '2.8rem', fontWeight: '800' }}>{balance.toFixed(2)} €</h1>
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
                      {mealInfo.price > 0 ? `${mealInfo.price.toFixed(2)} €` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Strichliste session={session} onUpdate={() => { fetchUserData(); fetchMealInfo(); }} isAdmin={profile?.is_admin} />
              <Fruehstueck session={session} onUpdate={fetchUserData} isAdmin={profile?.is_admin} />
              <Mahlzeiten session={session} onUpdate={() => { fetchUserData(); fetchMealInfo(); }} isAdmin={profile?.is_admin} />
            </div>
          </div>
        )}

        {/* Tab-Inhalte */}
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {activeTab === 'settings' && <UserSettings session={session} profile={profile} onUpdate={fetchUserData} transactions={userTransactions} />}
          {activeTab === 'users' && profile?.is_admin && <UserManagement />}
          {activeTab === 'finance' && profile?.is_admin && <FinancePanel session={session} isAdmin={profile?.is_admin} onUpdate={() => { fetchUserData(); fetchMealInfo(); }} />}
          {activeTab === 'stats' && profile?.is_admin && <StatsPanel />}
          {activeTab === 'admin' && profile?.is_admin && <AdminPanel />}
        </div>

        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: '48px', width: '100%', color: '#9ca3af', background: 'none', border: 'none', textDecoration: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
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