"use client"

import { useMemo } from "react"
import { useOrderbook, type OrderBookEntry } from "@/hooks/use-orderbook"
import { Spinner } from "@/components/ui/spinner"

function aggregateByPrice(entries: OrderBookEntry[]): { price: number; size: number }[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    map.set(e.price, (map.get(e.price) ?? 0) + parseFloat(e.size))
  }
  return Array.from(map.entries()).map(([price, size]) => ({
    price: parseFloat(price),
    size,
  }))
}

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  return size.toFixed(2)
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

const MAX_ROWS = 6

export type OrderbookClickInfo = {
  price: number
  side: "yes" | "no"
}

export function Orderbook({ tokenId, side, onSideChange, onPriceSelect }: {
  tokenId: string | undefined
  side: "yes" | "no"
  onSideChange: (side: "yes" | "no") => void
  onPriceSelect?: (info: OrderbookClickInfo) => void
}) {
  const { bids, asks, spread, lastTradePrice, loading } = useOrderbook(tokenId)

  // Asks: ascending by price, show bottom N, then reverse so lowest is at bottom (near spread)
  const sortedAsks = useMemo(() => {
    const agg = aggregateByPrice(asks)
    agg.sort((a, b) => a.price - b.price)
    const sliced = agg.slice(0, MAX_ROWS)
    // Cumulative total from bottom (lowest ask) up
    let cumulative = 0
    for (const row of sliced) {
      cumulative += row.size * row.price
      ;(row as any).total = cumulative
    }
    return sliced.reverse()
  }, [asks])

  // Bids: descending by price
  const sortedBids = useMemo(() => {
    const agg = aggregateByPrice(bids)
    agg.sort((a, b) => b.price - a.price)
    const sliced = agg.slice(0, MAX_ROWS)
    let cumulative = 0
    for (const row of sliced) {
      cumulative += row.size * row.price
      ;(row as any).total = cumulative
    }
    return sliced
  }, [bids])

  const maxSize = useMemo(() => {
    let max = 0
    for (const r of sortedBids) if (r.size > max) max = r.size
    for (const r of sortedAsks) if (r.size > max) max = r.size
    return max || 1
  }, [sortedBids, sortedAsks])

  if (!tokenId) return null

  const isLoading = loading && bids.length === 0 && asks.length === 0

  return (
    <div className="mt-4">
      {/* Side toggle */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trade</span>
        <button
          onClick={() => onSideChange("yes")}
          className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
            side === "yes"
              ? "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onSideChange("no")}
          className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
            side === "no"
              ? "bg-red-100 text-red-700/80 dark:bg-red-950/40 dark:text-red-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          No
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-4" />
        </div>
      ) : (
        <div className="text-xs tabular-nums">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-1 pb-1.5 text-[11px] text-muted-foreground uppercase tracking-wider border-b">
            <span />
            <span className="w-16 text-right">Price</span>
            <span className="w-24 text-right">Shares</span>
            <span className="w-24 text-right">Total</span>
          </div>

          {/* Asks */}
          <div className="relative">
            {sortedAsks.length === 0 ? (
              <div className="py-2 text-center text-muted-foreground">No asks</div>
            ) : (
              <>
                <div className="absolute left-0 top-1 text-[10px] font-semibold text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-950/40 px-1.5 py-0.5 rounded z-10">
                  Asks
                </div>
                {sortedAsks.map((row, i) => (
                  <div
                    key={`ask-${i}`}
                    className="relative grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-1 py-[3px] items-center cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => onPriceSelect?.({ price: row.price, side })}
                  >
                    <div className="relative h-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-red-500/15 dark:bg-red-500/10 rounded-sm"
                        style={{ width: `${(row.size / maxSize) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-red-600 dark:text-red-400">
                      {(row.price * 100).toFixed(1)}¢
                    </span>
                    <span className="w-24 text-right font-mono">
                      {formatSize(row.size)}
                    </span>
                    <span className="w-24 text-right font-mono text-muted-foreground">
                      {formatUsd((row as any).total)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Spread row */}
          <div className="flex items-center justify-between px-1 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Last: {lastTradePrice ? `${(parseFloat(lastTradePrice) * 100).toFixed(1)}¢` : "—"}
            </span>
            <span>
              Spread: {spread !== null ? `${(spread * 100).toFixed(1)}¢` : "—"}
            </span>
          </div>

          {/* Bids */}
          <div className="relative">
            {sortedBids.length === 0 ? (
              <div className="py-2 text-center text-muted-foreground">No bids</div>
            ) : (
              <>
                <div className="absolute left-0 top-1 text-[10px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-950/40 px-1.5 py-0.5 rounded z-10">
                  Bids
                </div>
                {sortedBids.map((row, i) => (
                  <div
                    key={`bid-${i}`}
                    className="relative grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-1 py-[3px] items-center cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => onPriceSelect?.({ price: row.price, side })}
                  >
                    <div className="relative h-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-teal-500/15 dark:bg-teal-500/10 rounded-sm"
                        style={{ width: `${(row.size / maxSize) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-teal-600 dark:text-teal-400">
                      {(row.price * 100).toFixed(1)}¢
                    </span>
                    <span className="w-24 text-right font-mono">
                      {formatSize(row.size)}
                    </span>
                    <span className="w-24 text-right font-mono text-muted-foreground">
                      {formatUsd((row as any).total)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
