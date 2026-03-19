import { getEvents } from "@/lib/gamma"
import { EventFeed } from "@/components/event-feed"

export default async function Page() {
  const events = await getEvents({
    active: true,
    closed: false,
    archived: false,
    offset: 0,
    limit: 20,
    order: "volume24hr",
    ascending: false,
  })

  return (
    <div className="mx-auto max-w-[90rem] px-6 py-6">
      <EventFeed initialEvents={events} />
    </div>
  )
}
