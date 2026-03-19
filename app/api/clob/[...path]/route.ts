import { NextRequest, NextResponse } from "next/server"
import { createBuilderHeaders } from "@/lib/builderSign"
import { rateLimit } from "@/lib/rateLimit"

const CLOB_HOST = "https://clob.polymarket.com"

const RATE_LIMIT = 60
const RATE_WINDOW = 10_000

const ALLOWED_PATHS = new Set([
  "/time",
  "/auth/api-key", "/auth/api-keys", "/auth/derive-api-key", "/auth/ban-status/closed-only",
  "/auth/readonly-api-key", "/auth/readonly-api-keys", "/auth/validate-readonly-api-key",
  "/auth/builder-api-key",
  "/sampling-simplified-markets", "/sampling-markets", "/simplified-markets",
  "/markets", "/market",
  "/book", "/books",
  "/midpoint", "/midpoints",
  "/price", "/prices",
  "/spread", "/spreads",
  "/last-trade-price", "/last-trades-prices",
  "/tick-size", "/neg-risk", "/fee-rate",
  "/order", "/orders",
  "/cancel-all", "/cancel-market-orders",
  "/data/orders", "/data/trades",
  "/order-scoring", "/orders-scoring",
  "/prices-history",
  "/notifications",
  "/balance-allowance", "/balance-allowance/update",
  "/rewards/user", "/rewards/user/total", "/rewards/user/percentages",
  "/rewards/markets/current",
  "/builder/trades",
  "/v1/heartbeats",
  "/rfq/request", "/rfq/quote", "/rfq/request/accept", "/rfq/quote/approve",
  "/rfq/data/requests", "/rfq/data/requester/quotes", "/rfq/data/quoter/quotes",
  "/rfq/data/best-quote", "/rfq/config",
])

const ALLOWED_PREFIXES = [
  "/data/order/",
  "/markets/",
  "/rewards/markets/",
  "/live-activity/events/",
]

function isPathAllowed(path: string): boolean {
  if (ALLOWED_PATHS.has(path)) return true
  return ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))
}

const L2_HEADERS = [
  "POLY_ADDRESS",
  "POLY_SIGNATURE",
  "POLY_TIMESTAMP",
  "POLY_NONCE",
  "POLY_API_KEY",
  "POLY_PASSPHRASE",
]

function buildForwardHeaders(req: NextRequest, builderHeaders: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  for (const key of L2_HEADERS) {
    const val = req.headers.get(key)
    if (val) headers[key] = val
  }

  Object.assign(headers, builderHeaders)
  return headers
}

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { allowed } = rateLimit(`clob:${ip}`, RATE_LIMIT, RATE_WINDOW)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { path } = await params
  const clobPath = "/" + path.join("/")

  if (!isPathAllowed(clobPath)) {
    return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 })
  }

  const url = new URL(clobPath, CLOB_HOST)

  req.nextUrl.searchParams.forEach((val, key) => {
    url.searchParams.set(key, val)
  })

  const method = req.method.toUpperCase()

  let bodyStr: string | undefined
  if (method !== "GET" && method !== "HEAD") {
    bodyStr = await req.text()
  }

  const builderHeaders = createBuilderHeaders(method, clobPath, bodyStr)
  const headers = buildForwardHeaders(req, builderHeaders)

  try {
    const resp = await fetch(url.toString(), {
      method,
      headers,
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(15000),
    })

    const data = await resp.text()

    return new NextResponse(data, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
      },
    })
  } catch {
    return NextResponse.json({ error: "CLOB request failed" }, { status: 502 })
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const DELETE = proxyRequest
export const PUT = proxyRequest
