import type { Market } from "@/lib/gamma"

export function parseYesPrice(market: Market): number {
  try {
    const raw = market.outcomePrices || market.outcome_prices
    const prices = JSON.parse(raw) as string[]
    return Number(prices[0]) || 0
  } catch {
    return 0
  }
}

export function parsePrices(market: Market): [number, number] {
  try {
    const prices = JSON.parse(market.outcomePrices || market.outcome_prices) as string[]
    return [Number(prices[0]) || 0, Number(prices[1]) || 0]
  } catch {
    return [0, 0]
  }
}

export function formatOdds(price: number): string {
  const pct = Math.round(price * 100)
  if (pct < 1 && price > 0) return "<1%"
  return `${pct}%`
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(0)}M`
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`
  return `$${vol.toFixed(0)}`
}
