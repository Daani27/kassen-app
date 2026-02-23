import { createContext, useContext, useState, useEffect } from 'react'
import { apiGetBranding } from './api'

const defaultBranding = {
  app_name: 'Kasse',
  app_subtitle: '',
  bug_report_url: '',
  push_default_title: 'Kasse',
}

const BrandingContext = createContext(defaultBranding)

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(defaultBranding)

  useEffect(() => {
    apiGetBranding().then((data) => {
      if (data && typeof data === 'object') {
        setBranding({
          app_name: data.app_name || 'Kasse',
          app_subtitle: data.app_subtitle || '',
          bug_report_url: data.bug_report_url || '',
          push_default_title: data.push_default_title || data.app_name || 'Kasse',
        })
      }
    }).catch(() => {})
  }, [])

  const updateBranding = (next) => {
    setBranding((prev) => ({ ...prev, ...next }))
  }

  const refreshBranding = () => {
    apiGetBranding().then((data) => {
      if (data && typeof data === 'object') {
        setBranding({
          app_name: data.app_name || 'Kasse',
          app_subtitle: data.app_subtitle || '',
          bug_report_url: data.bug_report_url || '',
          push_default_title: data.push_default_title || data.app_name || 'Kasse',
        })
      }
    }).catch(() => {})
  }

  return (
    <BrandingContext.Provider value={{ ...branding, updateBranding, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
