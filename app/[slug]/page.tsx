import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getEvents, getPriceHistory } from "@/lib/gamma"
import { MarketChart } from "@/components/market-chart"
import { HugeiconsIcon } from "@hugeicons/react"
import { SourceCodeIcon, Link01Icon, Bookmark01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EventTrading } from "@/components/event-trading"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { parseYesPrice } from "@/lib/prices"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const events = await getEvents({ slug })
  const event = events[0]
  if (!event) return { title: "Event not found" }
  return {
    title: `${event.title} | Prediction Market Starter Kit`,
    description: event.description?.slice(0, 160),
  }
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params
  const events = await getEvents({ slug })
  const event = events[0]

  if (!event) notFound()

  const tags = event.tags ?? []
  const series = event.series ?? []
  const breadcrumbs = [
    ...tags.slice(0, 1).map((t) => t.label),
    ...series.map((s) => s.title),
  ]

  const sortedMarkets = [...(event.markets ?? [])].sort((a, b) => {
    return parseYesPrice(b) - parseYesPrice(a)
  })

  const topMarkets = sortedMarkets.slice(0, 4)
  const chartMarkets = (
    await Promise.all(
      topMarkets.map(async (market) => {
        let tokenId = ""
        try {
          const ids = JSON.parse(market.clobTokenIds) as string[]
          tokenId = ids[0] ?? ""
        } catch {}
        if (!tokenId) return null

        let data = await getPriceHistory(tokenId, "all", 1440)
        if (data.length < 3) {
          data = await getPriceHistory(tokenId, "all", 60)
        }
        if (data.length < 2) return null
        return {
          label: market.groupItemTitle || market.question,
          data,
        }
      })
    )
  ).filter((m): m is NonNullable<typeof m> => m !== null)

  const firstTag = tags[0]
  const relatedEvents = firstTag
    ? (await getEvents({ tag_id: firstTag.id, active: true, closed: false, limit: 6, order: "volume24hr", ascending: false }))
        .filter((e) => e.id !== event.id)
        .slice(0, 5)
    : []

  return (
    <div className="mx-auto max-w-[90rem] px-6 py-8">
      <EventTrading markets={sortedMarkets} relatedEvents={relatedEvents} createdAt={event.createdAt} endDate={event.endDate} closed={event.closed}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="size-14 rounded-xl object-cover shrink-0"
              />
            )}
            <div>
              {breadcrumbs.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                  {breadcrumbs.map((label, i) => (
                    <span key={label}>
                      {i > 0 && <span className="mx-1">&middot;</span>}
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-2xl font-semibold">{event.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm">
              <HugeiconsIcon icon={SourceCodeIcon} className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <HugeiconsIcon icon={Link01Icon} className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <HugeiconsIcon icon={Bookmark01Icon} className="size-4" />
            </Button>
          </div>
        </div>

        {chartMarkets.length > 0 && (
          <div className="mt-6">
            <MarketChart markets={chartMarkets} />
          </div>
        )}

        <Collapsible className="my-2" defaultOpen>
          <Card className="p-3.5">
            <CollapsibleTrigger className="flex w-full items-center justify-between text-md font-medium cursor-pointer">
              Market Rules
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {event.description || "No rules available for this market."}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </EventTrading>
    </div>
  )
}
