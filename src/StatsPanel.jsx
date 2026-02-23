import React, { useEffect, useState } from 'react'
import { apiGetTransactions, apiGetGlobalExpenses, apiGetProfiles } from './api'
import { useBranding } from './BrandingContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function StatisticsPanel() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [data, setData] = useState({
    income: 0,
    expenses: 0,
    startBalance: 0,
    endBalance: 0,
    transactionList: [],
    loading: true
  })

  useEffect(() => {
    fetchStats()
  }, [startDate, endDate])

  async function fetchStats() {
    setData(prev => ({ ...prev, loading: true }))

    const userTrans = await apiGetTransactions(null, true)
    const globalExp = await apiGetGlobalExpenses()
    const profiles = await apiGetProfiles()

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]))

    const safeDate = (v) => {
      if (v == null || v === '') return null
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? null : d
    }

    const cleanUserTrans = (userTrans || []).map(t => {
      const amount = Number(t.amount) || 0
      const isCash = amount > 0
      const date = safeDate(t.created_at)
      return {
        ...t,
        amount,
        type: isCash ? 'Einzahlung' : 'Verzehr',
        isCashRelevant: isCash,
        name: profileMap[t.user_id] || 'Nutzer',
        date: date || new Date(0)
      }
    })

    const cleanGlobalExp = (globalExp || []).map(e => {
      const amount = Number(e.amount) || 0
      const date = safeDate(e.created_at)
      return {
        ...e,
        amount,
        type: e.category === 'korrektur' ? 'Korrektur' : 'Kassenausgabe',
        isCashRelevant: true,
        name: profileMap[e.created_by] || 'Admin',
        date: date || new Date(0)
      }
    })

    const allRecords = [...cleanUserTrans, ...cleanGlobalExp].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))

    let startBal = 0
    let periodIncome = 0
    let periodExpenses = 0
    const filteredList = []

    const sDate = new Date(startDate)
    const eDate = new Date(endDate)
    eDate.setHours(23, 59, 59, 999)

    allRecords.forEach(item => {
      const d = item.date
      if (!d || Number.isNaN(d.getTime())) return
      if (!item.is_cancelled) {
        if (item.isCashRelevant) {
          if (d < sDate) {
            startBal += item.amount
          } else if (d <= eDate) {
            if (item.amount > 0) periodIncome += item.amount
            else periodExpenses += item.amount
          }
        }
      }
      if (d >= sDate && d <= eDate) {
        filteredList.push(item)
      }
    })

    const endBal = startBal + periodIncome + periodExpenses
    setData({
      income: Number.isFinite(periodIncome) ? periodIncome : 0,
      expenses: Number.isFinite(periodExpenses) ? periodExpenses : 0,
      startBalance: Number.isFinite(startBal) ? startBal : 0,
      endBalance: Number.isFinite(endBal) ? endBal : 0,
      transactionList: filteredList.reverse(),
      loading: false
    })
  }

  const branding = useBranding()
  const pdfOrgName = branding.app_subtitle || branding.app_name || 'Kasse'

  const exportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.text('Detaillierter Kassenbericht', 14, 20)
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text(`${pdfOrgName} – Zeitraum: ${new Date(startDate).toLocaleDateString()} bis ${new Date(endDate).toLocaleDateString()}`, 14, 28)

      const tableRows = data.transactionList.map(t => {
        const d = t.created_at ? new Date(t.created_at) : null
        const dateStr = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : '—'
        const amt = Number(t.amount) || 0
        return [
          dateStr,
          t.is_cancelled ? `[STORNO] ${t.type}` : t.type,
          t.name || '—',
          t.description || '',
          `${(Number(amt) || 0).toFixed(2)} €`
        ]
      })

      autoTable(doc, {
        startY: 35,
        head: [['Datum', 'Typ', 'Nutzer', 'Beschreibung', 'Betrag']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [31, 41, 55], fontSize: 10 },
        styles: { fontSize: 9 }
      })

      const finalY = doc.lastAutoTable.finalY + 15
      doc.setFontSize(11); doc.setTextColor(0)
      const sb = Number(data.startBalance) || 0
      const inc = Number(data.income) || 0
      const exp = Number(data.expenses) || 0
      const eb = Number(data.endBalance) || 0
      doc.text(`Anfangsbestand (Bar):`, 14, finalY); doc.text(`${(Number(sb) || 0).toFixed(2)} €`, 80, finalY)
      doc.text(`Einnahmen (+):`, 14, finalY + 7); doc.text(`${(Number(inc) || 0).toFixed(2)} €`, 80, finalY + 7)
      doc.text(`Ausgaben (-):`, 14, finalY + 14); doc.text(`${(Number(exp) || 0).toFixed(2)} €`, 80, finalY + 14)

      doc.setLineWidth(0.5); doc.line(14, finalY + 18, 100, finalY + 18)
      doc.setFont(undefined, 'bold'); doc.text(`Endbestand (Bar):`, 14, finalY + 25); doc.text(`${(Number(eb) || 0).toFixed(2)} €`, 80, finalY + 25)

      doc.save(`Kassenbericht_${startDate}.pdf`)
    } catch (err) { console.error(err); alert("Fehler beim PDF-Export") }
  }

  return (
    <div style={containerStyle}>
      {/* Zeitraum & Filter */}
      <div style={cardStyle}>
        <h4 style={cardTitleStyle}>📅 Zeitraum & Export</h4>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <div style={{ flex: 1 }}>
            <label style={miniLabelStyle}>Von</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={miniLabelStyle}>Bis</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <button onClick={exportPDF} style={pdfBtnStyle} disabled={data.loading}>
          📄 PDF Bericht erstellen
        </button>
      </div>

      {/* Summary Grid */}
      <div style={summaryGridStyle}>
        <div style={cardStyle}>
          <small style={labelStyle}>Bar-Anfang</small>
          <div style={amountStyle}>{(Number(data.startBalance) || 0).toFixed(2)} €</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid #10b981' }}>
          <small style={labelStyle}>Bar-Ende</small>
          <div style={{ ...amountStyle, color: '#10b981' }}>{(Number(data.endBalance) || 0).toFixed(2)} €</div>
        </div>
      </div>

      {/* Transactions List */}
      <div style={cardStyle}>
        <h4 style={cardTitleStyle}>Transaktionsverlauf</h4>
        <div style={scrollAreaStyle}>
          {data.transactionList.length === 0 ? (
            <div style={emptyTextStyle}>Keine Buchungen im gewählten Zeitraum.</div>
          ) : (
            data.transactionList.map((t, i) => {
              const amt = Number(t.amount) || 0
              const d = t.created_at ? new Date(t.created_at) : null
              const dateStr = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : '—'
              return (
              <div key={i} style={{ ...listRowStyle, opacity: t.is_cancelled ? 0.4 : 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{dateStr}</div>
                  <div style={{ 
                    fontWeight: '700', 
                    color: t.is_cancelled ? '#94a3b8' : '#1e293b',
                    textDecoration: t.is_cancelled ? 'line-through' : 'none' 
                  }}>
                    {t.is_cancelled ? `[STORNO] ${t.description || t.type}` : (t.description || t.type)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.name ?? '—'}</div>
                </div>
                <div style={{ 
                  textAlign: 'right', 
                  fontWeight: '800', 
                  fontSize: '1rem',
                  color: t.is_cancelled ? '#cbd5e1' : (amt > 0 ? '#10b981' : '#ef4444'),
                  textDecoration: t.is_cancelled ? 'line-through' : 'none'
                }}>
                  {amt > 0 ? '+' : ''}{(Number(amt) || 0).toFixed(2)} €
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
const containerStyle = { display: 'flex', flexDirection: 'column', gap: '20px' }
const cardStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const cardTitleStyle = { marginTop: 0, marginBottom: '15px', fontSize: '0.9rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }
const inputStyle = { width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '0.9rem' }
const miniLabelStyle = { fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', marginBottom: '4px', display: 'block' }
const pdfBtnStyle = { width: '100%', padding: '14px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }
const summaryGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }
const labelStyle = { color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800' }
const amountStyle = { margin: '5px 0 0 0', fontSize: '1.4rem', fontWeight: '900', color: '#1e293b' }
const scrollAreaStyle = { maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }
const listRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f8fafc' }
const emptyTextStyle = { textAlign: 'center', padding: '30px', color: '#cbd5e1', fontSize: '0.9rem' }