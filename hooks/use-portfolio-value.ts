"use client"

import { useEffect, useState, useCallback } from "react"

interface PortfolioValue {
  user: string
  value: number
}

const API_URL = "https://data-api.polymarket.com/value"

export function usePortfolioValue(address: string | undefined) {
  const [portfolioValue, setPortfolioValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener("poly:refresh", handler)
    return () => window.removeEventListener("poly:refresh", handler)
  }, [refetch])

  useEffect(() => {
    if (!address) {
      setPortfolioValue(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`${API_URL}?user=${address}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch portfolio value")
        return res.json()
      })
      .then((data: PortfolioValue[]) => {
        if (!cancelled && data && data.length > 0) {
          setPortfolioValue(data[0].value.toString())
        }
      })
      .catch(() => {
        if (!cancelled) setPortfolioValue(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [address, tick])

  return { portfolioValue, loading }
}