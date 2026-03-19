"use client"

import { useState, useEffect, useCallback } from "react"
import { CLOB_URL } from "@/lib/polymarket/constants"

export type OrderBookEntry = {
  price: string
  size: string
}

export type OrderBook = {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: number | null
  lastTradePrice: string | null
}

const EMPTY: OrderBook = { bids: [], asks: [], spread: null, lastTradePrice: null }

export function useOrderbook(tokenId: string | undefined, pollInterval = 5000) {
  const [data, setData] = useState<OrderBook>(EMPTY)
  const [loading, setLoading] = useState(false)

  const fetchBook = useCallback(async () => {
    if (!tokenId) {
      setData(EMPTY)
      return
    }

    try {
      const res = await fetch(`${CLOB_URL}/book?token_id=${tokenId}`)
      if (!res.ok) throw new Error("Failed to fetch orderbook")

      const json = await res.json()
      const bids: OrderBookEntry[] = (json.bids ?? [])
      const asks: OrderBookEntry[] = (json.asks ?? [])

      const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null
      const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null
      const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null

      setData({
        bids,
        asks,
        spread,
        lastTradePrice: json.last_trade_price ?? null,
      })
    } catch {
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [tokenId])

  useEffect(() => {
    setLoading(true)
    fetchBook()
    const id = setInterval(fetchBook, pollInterval)
    return () => clearInterval(id)
  }, [fetchBook, pollInterval])

  return { ...data, loading, refetch: fetchBook }
}
