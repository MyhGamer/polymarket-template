"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Dialog as DialogPrimitive } from "radix-ui"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { searchMarketsAction } from "@/app/actions"
import type { Event } from "@/lib/gamma"
import { parseYesPrice } from "@/lib/prices"

export function SearchCommand() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<Event[]>([])
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(null)
  const requestRef = React.useRef(0)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
    }
  }, [open])

  function handleSearch(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const id = ++requestRef.current
    debounceRef.current = setTimeout(async () => {
      const data = await searchMarketsAction(value)
      if (id === requestRef.current) {
        setResults(data)
        setLoading(false)
      }
    }, 300)
  }

  function handleSelect(slug: string) {
    setOpen(false)
    router.push(`/${slug}`)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full max-w-lg flex items-center gap-2 rounded-full border bg-muted/50 px-3 h-10 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search markets</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Content className="fixed top-[15%] left-1/2 z-50 w-full max-w-xl -translate-x-1/2 rounded-xl bg-background ring-1 ring-border shadow-2xl overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Command shouldFilter={false} className="flex flex-col">
              <div className="flex items-center gap-3 border-b px-4">
                <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={handleSearch}
                  placeholder="Search markets..."
                  className="flex-1 h-14 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="min-h-[120px] max-h-[420px] overflow-y-auto p-2">
                {loading && (
                  <Command.Loading>
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  </Command.Loading>
                )}
                {!loading && query.trim() && results.length === 0 && (
                  <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No markets found.
                  </Command.Empty>
                )}
                {!loading && results.map((event) => {
                  const market = event.markets?.[0]
                  const odds = market ? Math.round(parseYesPrice(market) * 100) : null
                  return (
                    <Command.Item
                      key={event.id}
                      value={event.slug}
                      onSelect={() => handleSelect(event.slug)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer text-sm data-[selected=true]:bg-muted/60 transition-colors"
                    >
                      {event.image ? (
                        <img
                          src={event.image}
                          alt=""
                          className="size-9 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="size-9 rounded-lg bg-muted shrink-0" />
                      )}
                      <span className="flex-1 truncate">{event.title}</span>
                      {odds !== null && (
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {odds}%<span className="text-muted-foreground font-normal ml-1">chance</span>
                        </span>
                      )}
                    </Command.Item>
                  )
                })}
              </Command.List>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
