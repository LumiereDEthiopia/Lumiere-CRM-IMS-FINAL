/**
 * Global Settings Context — the single settings retrieval mechanism.
 *
 * Every module (POS/New Sale, Receipts, Sales, currency formatting, …) reads
 * the saved backend settings through useSettings() instead of duplicating
 * fetch logic. Business settings are always persisted server-side (Setting
 * table via /api/settings); this context only caches them in memory and
 * refreshes after every successful save so all modules see changes
 * immediately — no rebuild, no manual refresh required.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api.js'
import { setActiveCurrency } from '../lib/currency.js'
import { useAuth } from './AuthContext.jsx'

const SettingsContext = createContext(null)

function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [settingsMap, setSettingsMap] = useState({})
  const [settingsList, setSettingsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setError('')
    try {
      const res = await api.get('/api/settings')
      const list = res.data || []
      const map = {}
      list.forEach((s) => { map[s.key] = s.value || '' })
      setSettingsList(list)
      setSettingsMap(map)
      // Apply the saved currency app-wide (Settings → General → Currency).
      if (map.currency) setActiveCurrency(map.currency)
    } catch (e) {
      setError(e.message || 'Failed to load settings')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  // Load once after login; clear on logout so another session re-fetches.
  useEffect(() => {
    if (isAuthenticated) {
      load()
    } else {
      setSettingsMap({})
      setSettingsList([])
      setLoading(true)
      setError('')
    }
  }, [isAuthenticated, load])

  const getSetting = useCallback((key, fallback = '') => {
    const value = settingsMap[key]
    return value === undefined || value === '' ? fallback : value
  }, [settingsMap])

  /**
   * Persist changes (Settings page save). Sends the same batch PUT the
   * Settings page always used, then updates the shared state from the server
   * response so every other module sees the new values immediately.
   * Throws on failure — callers must show the error and keep user input.
   */
  const saveSettings = useCallback(async (updates) => {
    const payload = updates.map((u) => ({ key: u.key, value: u.value, type: u.type }))
    const res = await api.put('/api/settings', { settings: payload })
    const saved = res.data || []
    // Merge server-confirmed values into the local map (single source of truth
    // stays the backend response — never assume the frontend value stuck).
    setSettingsMap((prev) => {
      const next = { ...prev }
      saved.forEach((s) => { if (s && s.key) next[s.key] = s.value || '' })
      return next
    })
    setSettingsList((prev) => {
      const byKey = new Map(prev.map((s) => [s.key, s]))
      saved.forEach((s) => { if (s && s.key) byKey.set(s.key, s) })
      return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
    })
    if (settingsMap.currency || saved.some((s) => s.key === 'currency')) {
      const currencyEntry = saved.find((s) => s.key === 'currency')
      setActiveCurrency(currencyEntry ? currencyEntry.value : settingsMap.currency)
    }
    return saved
  }, [settingsMap.currency])

  const value = useMemo(() => ({
    settingsMap,
    settingsList,
    loading,
    error,
    getSetting,
    refreshSettings: load,
    saveSettings
  }), [settingsMap, settingsList, loading, error, getSetting, load, saveSettings])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  // Components rendered outside the provider (e.g. tests) get a safe fallback
  // instead of crashing — settings simply resolve to their fallback values.
  if (!ctx) {
    return {
      settingsMap: {},
      settingsList: [],
      loading: false,
      error: '',
      getSetting: (key, fallback = '') => fallback,
      refreshSettings: async () => [],
      saveSettings: async () => []
    }
  }
  return ctx
}

export { SettingsProvider }
export default SettingsContext
