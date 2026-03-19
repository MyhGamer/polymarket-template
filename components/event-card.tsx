import Link from "next/link"
import type { Event } from "@/lib/gamma"
import { Card } from "@/components/ui/card"
import { parseYesPrice, parsePrices, formatOdds, formatVolume } from "@/lib/prices"

function OddsBar({ label, price }: { label: string; price: number }) {
  const pct = Math.round(price * 100)
  return (
    <div className="relative flex items-center justify-between rounded-md overflow-hidden h-8 px-2.5">
      <div
        className="absolute inset-y-0 left-0 bg-border/50 dark:bg-border/30 rounded-md"
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
      <span className="relative text-sm truncate">{label}</span>
      <span className="relative text-sm font-semibold ml-2 shrink-0">{formatOdds(price)}</span>
    </div>
  )
}

export function EventCard({ event }: { event: Event }) {
  const markets = [...(event.markets ?? [])].sort(
    (a, b) => parseYesPrice(b) - parseYesPrice(a)
  )
  const hasMultipleMarkets = markets.length > 1
  const singleMarket = markets.length === 1 ? markets[0] : null
  const [yesPrice, noPrice] = singleMarket ? parsePrices(singleMarket) : [0, 0]

  return (
    <Link href={`/${event.slug}`} className="block">
    <Card className="gap-2 p-4 transition-shadow hover:shadow-sm min-h-[140px] justify-between">
      <div className="flex items-center gap-3">
        {event.image && (
          <img
            src={event.image}
            alt=""
            className="size-8 rounded-lg object-cover shrink-0"
          />
        )}
        <h2 className="font-semibold leading-snug line-clamp-2">{event.title}</h2>
      </div>

      <div className="flex flex-col gap-1.5">
        {hasMultipleMarkets ? (
          markets.slice(0, 2).map((market) => (
            <OddsBar
              key={market.id}
              label={market.groupItemTitle || market.question}
              price={parseYesPrice(market)}
            />
          ))
        ) : (
          <>
            <OddsBar label="Yes" price={yesPrice} />
            <OddsBar label="No" price={noPrice} />
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{formatVolume(event.volume ?? 0)} Vol.</span>
          <span>{formatVolume(event.liquidity ?? 0)} Liq.</span>
        </div>
        {event.endDate && (
          <span>{new Date(event.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        )}
      </div>
    </Card>
    </Link>
  )
}
