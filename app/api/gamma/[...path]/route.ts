import { NextRequest, NextResponse } from "next/server"
import { rateLimit, getClientIp } from "@/lib/rateLimit"

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com"

const RATE_LIMIT = 100
const RATE_WINDOW = 10_000

const ALLOWED_PATHS = new Set(["markets", "events", "public-search"])

// Allowed query parameters for gamma API
const ALLOWED_QUERY_PARAMS = new Set([
  "id", "ids", "slug", "condition_id", "condition_ids",
  "limit", "offset", "order", "sort", "closed", "archived",
  "active", "tag", "tags", "currency", "start_ts", "end_ts",
  "text", "query", "outcome", "outcome_assets",
  "cardinality_single", "cardinality_multi", "has_cards",
  "liquidity_num_min", "liquidity_num_max",
  "volume_num_min", "volume_num_max",
  "clob_token_ids", "token_ids",
])

function validateQueryParams(searchParams: URLSearchParams): string | null {
  for (const [key] of searchParams) {
    if (!ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) {
      return `Unexpected query parameter: ${key}`
    }
  }
  return null
}

async function handler(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req)
  const { allowed } = rateLimit(`gamma:${ip}`, RATE_LIMIT, RATE_WINDOW)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const url = new URL(req.url)
  const pathSegments = url.pathname.replace(/^\/api\/gamma\/?/, "").split("/").filter(Boolean)
  const basePath = pathSegments[0]

  // H1: Path traversal protection
  if (pathSegments.some(s => s === ".." || s === ".")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  if (!basePath || !ALLOWED_PATHS.has(basePath)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  }

  // Validate query parameters
  const queryError = validateQueryParams(url.searchParams)
  if (queryError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const gammaUrl = `${GAMMA_BASE_URL}/${pathSegments.join("/")}${url.search}`

  try {
    const resp = await fetch(gammaUrl, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    })

    const data = await resp.text()

    // Sanitize error responses
    if (!resp.ok) {
      return NextResponse.json(
        { error: "Upstream service error" },
        { status: resp.status >= 500 ? 502 : resp.status }
      )
    }

    return new NextResponse(data, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
      },
    })
  } catch {
    return NextResponse.json({ error: "Gamma request failed" }, { status: 502 })
  }
}

export const GET = handler
