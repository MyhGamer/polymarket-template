"use client"

import type { ApiCredentials } from "./trading"

export interface TradingSession {
  eoaAddress: string
  safeAddress: string
  isSafeDeployed: boolean
  hasApiCredentials: boolean
  hasApprovals: boolean
  apiCredentials?: ApiCredentials
  lastChecked: number
}

function storageKey(address: string) {
  return `trading_session_${address.toLowerCase()}`
}

export function loadSession(address: string): TradingSession | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(storageKey(address))
  if (!stored) return null
  try {
    const session = JSON.parse(stored) as TradingSession
    if (session.eoaAddress.toLowerCase() !== address.toLowerCase()) {
      localStorage.removeItem(storageKey(address))
      return null
    }
    return session
  } catch {
    return null
  }
}

export function saveSession(address: string, session: TradingSession) {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey(address), JSON.stringify(session))
}

export function clearSession(address: string) {
  if (typeof window === "undefined") return
  localStorage.removeItem(storageKey(address))
}
