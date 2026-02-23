/**
 * Gemeinsames UI-Theme für alle Tabs – einheitliche Karten, Abstände, Typografie.
 */

export const SECTION_GAP = 20

export const tabContentStyle = {
  paddingTop: 4,
  paddingBottom: 24,
  minHeight: 0,
}

export const cardStyle = {
  backgroundColor: '#fff',
  padding: 24,
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
}

export const sectionTitleStyle = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 800,
  color: '#111827',
}

export const sectionSubtitleStyle = {
  margin: '4px 0 0 0',
  fontSize: '0.8rem',
  color: '#64748b',
}

export const labelStyle = {
  fontSize: '0.65rem',
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'block',
  marginBottom: 6,
}

export const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
}

export const selectStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  backgroundColor: '#fff',
  fontSize: '0.95rem',
  fontWeight: 600,
}

export const primaryBtnStyle = {
  padding: '12px 20px',
  borderRadius: 12,
  border: 'none',
  backgroundColor: '#111827',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.95rem',
  cursor: 'pointer',
}

export const secondaryBtnStyle = {
  padding: '12px 20px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
  color: '#374151',
  fontWeight: 700,
  fontSize: '0.95rem',
  cursor: 'pointer',
}

export const emptyStateStyle = {
  textAlign: 'center',
  padding: 32,
  color: '#94a3b8',
  fontSize: '0.9rem',
  backgroundColor: '#f8fafc',
  borderRadius: 16,
  border: '2px dashed #e2e8f0',
}
