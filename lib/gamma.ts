const GAMMA_BASE_URL = "https://gamma-api.polymarket.com"
const GAMMA_PROXY_URL = "/api/gamma"

// Use proxy for client-side calls (avoids CORS), direct URL for server-side
function getBaseUrl() {
  return typeof window !== "undefined" ? GAMMA_PROXY_URL : GAMMA_BASE_URL
}

export interface Market {
  id: string
  question: string
  slug: string
  description: string
  active: boolean
  closed: boolean
  archived: boolean
  volume: number
  volume_24hr: number
  liquidity: number
  start_date: string
  end_date: string
  outcome_prices: string
  outcomePrices: string
  outcomes: string
  image: string
  icon: string
  groupItemTitle: string
  volumeNum: number
  clobTokenIds: string
  negRisk?: boolean
  conditionId?: string
  tokens: {
    token_id: string
    outcome: string
    price: number
    winner: boolean
  }[]
}

export interface Event {
  id: string
  title: string
  slug: string
  description: string
  active: boolean
  closed: boolean
  archived: boolean
  volume: number
  volume_24hr: number
  liquidity: number
  start_date: string
  end_date: string
  image: string
  icon: string
  tag_id: string
  endDate: string
  createdAt: string
  commentCount: number
  competitive: number
  markets: Market[]
  tags: { id: string; label: string; slug: string }[]
  series: { id: string; title: string; slug: string }[]
  has_more?: boolean
}

export interface PricePoint {
  t: number
  p: number
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return ""
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
}

export async function getEvents(params: {
  active?: boolean
  closed?: boolean
  archived?: boolean
  limit?: number
  offset?: number
  order?: string
  ascending?: boolean
  slug?: string
  tag_id?: string
  series_id?: string
} = {}): Promise<Event[]> {
  const query = buildQuery(params)
  const res = await fetch(`${GAMMA_BASE_URL}/events${query}`, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Gamma API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export async function getPriceHistory(
  tokenId: string,
  interval: "1h" | "6h" | "1d" | "1w" | "1m" | "max" | "all" = "all",
  fidelity: number = 60
): Promise<PricePoint[]> {
  const query = buildQuery({ market: tokenId, interval, fidelity })
  const res = await fetch(`https://clob.polymarket.com/prices-history${query}`, {
    cache: "no-store",
  })

  if (!res.ok) return []

  const data = await res.json()
  return data.history ?? []
}

export async function searchEvents(query: string, limit = 5): Promise<Event[]> {
  const q = buildQuery({ q: query, limit_per_type: limit, events_status: "active" })
  const res = await fetch(`${GAMMA_BASE_URL}/public-search${q}`, {
    cache: "no-store",
  })

  if (!res.ok) return []
  const data = await res.json()
  return data.events ?? []
}

export interface MarketInfo {
  conditionId: string
  question: string
  slug: string
  eventSlug: string
  icon: string
  outcome: string
}

export async function getMarketsByConditionIds(conditionIds: string[]): Promise<Map<string, MarketInfo>> {
  const result = new Map<string, MarketInfo>()

  if (conditionIds.length === 0) return result

  try {
    const query = buildQuery({ condition_ids: conditionIds.join(","), limit: 100 })
    const res = await fetch(`${getBaseUrl()}/markets${query}`, {
      cache: "no-store",
    })

    if (!res.ok) {
      console.error("[Gamma] Markets fetch failed:", res.status)
      return result
    }

    const markets = await res.json() as Market[]
    console.log("[Gamma] Fetched markets:", markets.length)

    for (const market of markets) {
      // Get outcome from the order - we'll use "Yes" as default since we can't know from here
      result.set(market.id, {
        conditionId: market.id,
        question: market.question,
        slug: market.slug,
        eventSlug: market.slug,
        icon: market.icon || market.image || "",
        outcome: "Yes", // Default, will be overridden by order.outcome
      })
    }

    console.log("[Gamma] Market info map size:", result.size)
    return result
  } catch (err) {
    console.error("[Gamma] Error fetching markets:", err)
    return result
  }
}

export async function getMarketsInfoByTokenIds(tokenIds: string[]): Promise<Map<string, MarketInfo>> {
  const result = new Map<string, MarketInfo>()

  if (tokenIds.length === 0) return result

  try {
    const query = buildQuery({ token_ids: tokenIds.join(","), limit: 100 })
    const res = await fetch(`${getBaseUrl()}/markets${query}`, {
      cache: "no-store",
    })

    if (!res.ok) {
      console.error("[Gamma] Markets by token fetch failed:", res.status)
      return result
    }

    const markets = await res.json() as Market[]
    console.log("[Gamma] Fetched markets by token:", markets.length)

    for (const market of markets) {
      let tokens: { token_id: string; outcome: string }[] = []
      try {
        const ids = JSON.parse(market.clobTokenIds || "[]")
        tokens = ids.map((id: string, i: number) => ({
          token_id: id,
          outcome: i === 0 ? "Yes" : "No",
        }))
      } catch {
        tokens = market.tokens || []
      }

      for (const token of tokens) {
        result.set(token.token_id, {
          conditionId: market.id,
          question: market.question,
          slug: market.slug,
          eventSlug: market.slug,
          icon: market.icon || market.image || "",
          outcome: token.outcome,
        })
      }
    }

    console.log("[Gamma] Market info by token map size:", result.size)
    return result
  } catch (err) {
    console.error("[Gamma] Error fetching markets by token:", err)
    return result
  }
}
