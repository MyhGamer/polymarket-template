"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import type { Event } from "@/lib/gamma"
import { EventCard } from "@/components/event-card"
import { Spinner } from "@/components/ui/spinner"
import { loadMoreEvents } from "@/app/actions"

const PAGE_SIZE = 20

export function EventFeed({ initialEvents }: { initialEvents: Event[] }) {
  const [events, setEvents] = useState(initialEvents)
  const [offset, setOffset] = useState(initialEvents.length)
  const [hasMore, setHasMore] = useState(initialEvents.length >= PAGE_SIZE)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(() => {
    if (isPending || !hasMore) return
    startTransition(async () => {
      const newEvents = await loadMoreEvents(offset)
      if (newEvents.length < PAGE_SIZE) setHasMore(false)
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...newEvents.filter((e) => !seen.has(e.id))]
      })
      setOffset((prev) => prev + newEvents.length)
    })
  }, [offset, isPending, hasMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: "400px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      <div ref={sentinelRef} className="flex justify-center py-8">
        {isPending && <Spinner className="size-6" />}
      </div>
    </>
  )
}
