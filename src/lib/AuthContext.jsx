import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [backendOffline, setBackendOffline] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me()
      setUser(user)
      setBackendOffline(false)
    } catch (err) {
      setUser(null)
      // A 401 just means "not signed in" — only treat network failures as offline.
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setBackendOffline(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function login(email, password, licenseId) {
    const { user } = await api.login(email, password, licenseId)
    setUser(user)
    return user
  }

  async function signup(name, email, password) {
    // Real, changed response shape: a genuine Owner signup still logs
    // in immediately (matching the exact prior behavior); a real
    // Company User signup no longer does — it returns
    // {requiresVerification: true, email, ...} instead of a user,
    // since the account isn't usable yet (real email verification,
    // then a real Owner-issued License, both required before login).
    const result = await api.signup(name, email, password)
    if (result.user) setUser(result.user) // only ever true for the real Owner-exempt path
    return result
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  const value = { user, loading, backendOffline, login, signup, logout, refresh, isOwner: user?.role === 'owner' }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
