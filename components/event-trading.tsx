"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useAccount } from "wagmi"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { TradeCard } from "@/components/trade-card"
import { Orderbook, type OrderbookClickInfo } from "@/components/orderbook"
import type { Market, Event } from "@/lib/gamma"
import { parsePrices, parseYesPrice, formatVolume } from "@/lib/prices"
import { deriveSafeAddress } from "@/lib/polymarket/relayer"
import { getPositions, type Position } from "@/lib/data-api"

function formatDate(date: string | null) {
  if (!date) return null
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function Timeline({ createdAt, endDate, closed }: { createdAt: string | null; endDate: string | null; closed: boolean }) {
  const now = new Date()
  const ended = closed || (endDate && new Date(endDate) <= now)

  const steps = [
    { label: "Market Created", date: formatDate(createdAt), done: true },
    { label: "Market Ends", date: formatDate(endDate), done: !!ended },
    { label: "Market Resolution", date: closed ? "Resolved" : null, done: closed },
  ]

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isActive = !step.done && i === steps.findIndex((s) => !s.done)
        return (
          <div key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`size-2.5 rounded-full shrink-0 mt-1.5 ${
                step.done
                  ? "bg-violet-500 dark:bg-violet-400"
                  : isActive
                  ? "bg-foreground"
                  : "bg-muted-foreground/25"
              }`} />
              {i < steps.length - 1 && (
                <div className={`w-px flex-1 min-h-5 ${
                  step.done ? "bg-violet-500/40 dark:bg-violet-400/30" : "bg-border"
                }`} />
              )}
            </div>
            <div className={`flex-1 flex items-baseline justify-between ${i < steps.length - 1 ? "pb-3" : ""}`}>
              <span className={`text-sm ${isActive ? "font-medium" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {step.date ?? "Pending"}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EventTrading({ markets, relatedEvents = [], createdAt, endDate, closed, children }: { markets: Market[]; relatedEvents?: Event[]; createdAt?: string; endDate?: string; closed?: boolean; children?: React.ReactNode }) {
  const [selectedMarketId, setSelectedMarketId] = useState(markets[0]?.id)
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes")
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null)
  const [orderbookSide, setOrderbookSide] = useState<"yes" | "no">("yes")
  const [limitPrice, setLimitPrice] = useState<number | null>(null)
  const [limitPriceKey, setLimitPriceKey] = useState(0)

  const handleSelect = (marketId: string, side: "yes" | "no") => {
    setSelectedMarketId(marketId)
    setSelectedSide(side)
  }

  const handlePriceSelect = (info: OrderbookClickInfo) => {
    setLimitPrice(info.price)
    setSelectedSide(info.side)
    setLimitPriceKey((k) => k + 1)
  }

  const toggleOrderbook = (marketId: string) => {
    setExpandedMarketId((prev) => (prev === marketId ? null : marketId))
  }

  const getTokenId = (market: Market, side: "yes" | "no"): string | undefined => {
    try {
      const ids = JSON.parse(market.clobTokenIds) as string[]
      return side === "yes" ? ids[0] : ids[1]
    } catch {
      return undefined
    }
  }

  // Fetch user positions for these markets
  const { address } = useAccount()
  const safeAddress = address ? deriveSafeAddress(address) : undefined
  const [positions, setPositions] = useState<Position[]>([])

  const refreshPositions = useCallback(() => {
    if (!safeAddress) { setPositions([]); return }
    getPositions(safeAddress).then(setPositions).catch(() => setPositions([]))
  }, [safeAddress])

  useEffect(() => {
    refreshPositions()
  }, [refreshPositions])

  // Listen for global refresh events (after trades)
  useEffect(() => {
    const handler = () => refreshPositions()
    window.addEventListener("poly:refresh", handler)
    return () => window.removeEventListener("poly:refresh", handler)
  }, [refreshPositions])

  // Build token ID → position map for quick lookup
  const positionsByToken = new Map<string, Position>()
  for (const pos of positions) {
    if (pos.asset) positionsByToken.set(pos.asset, pos)
  }

  const getMarketPositions = (market: Market): Position[] => {
    try {
      const ids = JSON.parse(market.clobTokenIds) as string[]
      return ids.map(id => positionsByToken.get(id)).filter((p): p is Position => !!p && p.size > 0.01)
    } catch { return [] }
  }

  const singleMarket = markets.length === 1 ? markets[0] : null
  const singleTokenId = singleMarket ? getTokenId(singleMarket, orderbookSide) : undefined

  return (
    <div className="flex gap-8">
      <div className="flex-1 min-w-0">
        {children}

        {/* Single market — show position + orderbook inline */}
        {singleMarket && getMarketPositions(singleMarket).length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-muted-foreground">Your position:</span>
            {getMarketPositions(singleMarket).map((pos) => (
              <span
                key={pos.asset}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  pos.outcome === "Yes"
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                    : "bg-red-100 text-red-700/80 dark:bg-red-950/30 dark:text-red-400"
                }`}
              >
                {pos.outcome} {pos.size.toFixed(pos.size < 1 ? 1 : 0)} · {(pos.avgPrice * 100).toFixed(1)}¢
              </span>
            ))}
          </div>
        )}
        {singleMarket && (
          <Orderbook
            tokenId={singleTokenId}
            side={orderbookSide}
            onSideChange={setOrderbookSide}
            onPriceSelect={handlePriceSelect}
          />
        )}

        {/* Multi-market — orderbook expands under selected row */}
        {markets.length > 1 && (
          <div className="divide-y">
            {markets.map((market) => {
              const [yesPrice, noPrice] = parsePrices(market)
              const pct = Math.round(yesPrice * 100)
              const yesCents = (yesPrice * 100).toFixed(1)
              const noCents = (noPrice * 100).toFixed(1)
              const vol = market.volumeNum ?? market.volume ?? 0
              const isExpanded = expandedMarketId === market.id
              const tokenId = getTokenId(market, orderbookSide)

              return (
                <div key={market.id}>
                  <div
                    className={`flex items-center justify-between py-3 cursor-pointer transition-colors hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""}`}
                    onClick={() => {
                      handleSelect(market.id, "yes")
                      toggleOrderbook(market.id)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                      <div>
                        <div className="font-medium text-base">
                          {market.groupItemTitle || market.question}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 ml-0.5">
                          <span className="text-sm text-muted-foreground">
                            {formatVolume(vol)} Vol.
                          </span>
                          {getMarketPositions(market).map((pos) => (
                            <span
                              key={pos.asset}
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                pos.outcome === "Yes"
                                  ? "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                                  : "bg-red-100 text-red-700/80 dark:bg-red-950/30 dark:text-red-400"
                              }`}
                            >
                              {pos.outcome} {pos.size.toFixed(pos.size < 1 ? 1 : 0)} · {(pos.avgPrice * 100).toFixed(1)}¢
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <span className="text-2xl font-medium w-20 text-right">
                        {pct < 1 && yesPrice > 0 ? "<1%" : `${pct}%`}
                      </span>

                      <Button
                        size="lg"
                        className="bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-400 dark:hover:bg-teal-950/60 border-0 min-w-[140px] font-medium"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelect(market.id, "yes")
                        }}
                      >
                        Buy Yes {yesCents}¢
                      </Button>
                      <Button
                        size="lg"
                        className="bg-red-50 text-red-700/80 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 border-0 min-w-[140px] font-medium"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelect(market.id, "no")
                        }}
                      >
                        Buy No {noCents}¢
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pb-4 pt-1 px-6">
                      <Orderbook
                        tokenId={tokenId}
                        side={orderbookSide}
                        onSideChange={setOrderbookSide}
                        onPriceSelect={handlePriceSelect}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="w-[380px] shrink-0 ml-5 self-start sticky top-8">
        <TradeCard
          key={limitPriceKey}
          markets={markets}
          selectedMarketId={selectedMarketId}
          selectedSide={selectedSide}
          limitPrice={limitPrice}
          onTradeComplete={refreshPositions}
        />

        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-4">Timeline</h3>
          <Timeline
            createdAt={createdAt ?? null}
            endDate={endDate ?? null}
            closed={!!closed}
          />
        </div>

        {relatedEvents.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-lg mb-4">Related Markets</h3>
            <div className="divide-y">
              {relatedEvents.map((event, i) => {
                const market = event.markets?.[0]
                const pct = market ? Math.round(parseYesPrice(market) * 100) : 0

                return (
                  <Link
                    key={event.id}
                    href={`/${event.slug}`}
                    className="flex items-center gap-3 py-3 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground w-5 shrink-0">{i + 1}</span>
                    {event.image && (
                      <img src={event.image} alt="" className="size-8 rounded-md object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug line-clamp-2">{event.title}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold">{pct}%</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
