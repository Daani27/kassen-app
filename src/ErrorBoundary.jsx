import { Component } from 'react'

/**
 * Fängt Render-Fehler in Kind-Komponenten ab und zeigt eine Fallback-UI,
 * damit keine weiße Seite erscheint und der Fehler sichtbar ist.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          padding: '24px',
          maxWidth: '400px',
          margin: '40px auto',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '16px',
          fontFamily: 'sans-serif',
          color: '#991b1b'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>⚠️ Etwas ist schiefgelaufen</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', wordBreak: 'break-word' }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{
              padding: '10px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Seite neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
