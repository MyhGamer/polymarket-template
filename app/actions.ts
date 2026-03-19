"use server"

import { getEvents, searchEvents, type Event } from "@/lib/gamma"

export async function searchMarketsAction(query: string): Promise<Event[]> {
  if (!query.trim()) return []
  return searchEvents(query.trim(), 5)
}

export async function loadMoreEvents(offset: number): Promise<Event[]> {
  return getEvents({
    active: true,
    closed: false,
    archived: false,
    offset,
    limit: 20,
    order: "volume24hr",
    ascending: false,
  })
}
