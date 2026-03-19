import { NextRequest, NextResponse } from "next/server"
import { createBuilderHeaders } from "@/lib/builderSign"
import { rateLimit, getClientIp } from "@/lib/rateLimit"
import { getAuthenticatedAddress } from "@/lib/serverAuth"

const CLOB_HOST = "https://clob.polymarket.com"

const RATE_LIMIT = 60
const RATE_WINDOW = 10_000

// Maximum request body size (100KB)
const MAX_BODY_SIZE = 100 * 1024

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

/** H1: Reject path segments that could traverse directories */
function hasPathTraversal(segments: string[]): boolean {
  return segments.some(s => s === ".." || s === "." || s === "")
}

function isValidEthAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/** Endpoints that require L2 auth (user's CLOB credentials) */
const AUTHENTICATED_PATHS = new Set([
  "/auth/api-key", "/auth/api-keys", "/auth/derive-api-key",
  "/auth/readonly-api-key", "/auth/readonly-api-keys",
  "/auth/builder-api-key",
  "/order", "/orders",
  "/cancel-all", "/cancel-market-orders",
  "/data/orders",
  "/balance-allowance", "/balance-allowance/update",
  "/notifications",
  "/rfq/request", "/rfq/quote", "/rfq/request/accept", "/rfq/quote/approve",
])
const AUTHENTICATED_PREFIXES = ["/data/order/"]

function needsL2Auth(path: string): boolean {
  if (AUTHENTICATED_PATHS.has(path)) return true
  return AUTHENTICATED_PREFIXES.some(prefix => path.startsWith(prefix))
}

const L2_HEADERS = [
  "POLY_ADDRESS",
  "POLY_SIGNATURE",
  "POLY_TIMESTAMP",
  "POLY_NONCE",
  "POLY_API_KEY",
  "POLY_PASSPHRASE",
]

// Allowed query parameter patterns (basic validation)
const ALLOWED_QUERY_PARAMS = new Set([
  "token_id", "asset_id", "market", "condition_id", "outcome",
  "side", "size", "price", "expiration", "nonce",
  "next_cursor", "limit", "offset", "order", "sort",
  "start_ts", "end_ts", "id", "ids", "slug", "archived",
  "user", "address", "maker_address", "taker_address",
  "asset_ids", "transaction", "match_only",
])

function validateQueryParams(searchParams: URLSearchParams): string | null {
  for (const [key] of searchParams) {
    if (!ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) {
      return `Unexpected query parameter: ${key}`
    }
  }
  return null
}

/**
 * H3: Build forward headers with L2 auth validation.
 * L2 headers (POLY_ADDRESS, POLY_SIGNATURE, etc.) are only forwarded when:
 * 1. The user has a valid session cookie
 * 2. POLY_ADDRESS is a valid Ethereum address
 * 3. POLY_ADDRESS matches the authenticated session address (prevents impersonation)
 */
function buildForwardHeaders(
  req: NextRequest,
  builderHeaders: Record<string, string>,
  authenticatedAddress: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  // Only forward L2 auth headers if user has a valid session
  if (authenticatedAddress) {
    const polyAddress = req.headers.get("POLY_ADDRESS")

    if (polyAddress) {
      // Validate format
      if (!isValidEthAddress(polyAddress)) {
        // Skip forwarding invalid L2 headers
      } else {
        // Forward all L2 headers
        for (const key of L2_HEADERS) {
          const val = req.headers.get(key)
          if (val) headers[key] = val
        }
      }
    }
  }

  Object.assign(headers, builderHeaders)
  return headers
}

// Sanitize error responses to avoid leaking internal info
function sanitizeError(error: unknown, defaultMessage: string): string {
  // Only return generic error messages to client
  return defaultMessage
}

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const ip = getClientIp(req)
  const { allowed } = rateLimit(`clob:${ip}`, RATE_LIMIT, RATE_WINDOW)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { path } = await params

  // H1: Path traversal protection
  if (hasPathTraversal(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const clobPath = "/" + path.join("/")

  // H3: Require authenticated session for endpoints that use L2 auth
  const authenticatedAddress = getAuthenticatedAddress(req)
  if (needsL2Auth(clobPath) && !authenticatedAddress) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!isPathAllowed(clobPath)) {
    return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 })
  }

  // Validate query parameters
  const queryError = validateQueryParams(req.nextUrl.searchParams)
  if (queryError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const url = new URL(clobPath, CLOB_HOST)

  req.nextUrl.searchParams.forEach((val, key) => {
    url.searchParams.set(key, val)
  })

  const method = req.method.toUpperCase()

  let bodyStr: string | undefined
  if (method !== "GET" && method !== "HEAD") {
    // Read body with size limit
    const reader = req.body?.getReader()
    if (reader) {
      const chunks: Uint8Array[] = []
      let totalSize = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          totalSize += value.length
          if (totalSize > MAX_BODY_SIZE) {
            return NextResponse.json({ error: "Request body too large" }, { status: 413 })
          }
          chunks.push(value)
        }
        bodyStr = chunks.length > 0
          ? new TextDecoder().decode(Buffer.concat(chunks))
          : undefined
      } catch {
        return NextResponse.json({ error: "Failed to read request body" }, { status: 400 })
      }
    }
  }

  const builderHeaders = createBuilderHeaders(method, clobPath, bodyStr)
  const headers = buildForwardHeaders(req, builderHeaders, authenticatedAddress)

  try {
    const resp = await fetch(url.toString(), {
      method,
      headers,
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(15000),
    })

    const data = await resp.text()

    // For error responses, check if we should sanitize
    if (!resp.ok) {
      try {
        const parsed = JSON.parse(data)
        // Only pass through known error formats, hide internal details
        if (parsed.error && typeof parsed.error === "string") {
          // Generic error messages are okay
          return new NextResponse(data, {
            status: resp.status,
            headers: { "Content-Type": "application/json" },
          })
        }
      } catch {
        // Non-JSON error - return generic message
        return NextResponse.json(
          { error: "Upstream service error" },
          { status: resp.status >= 500 ? 502 : resp.status }
        )
      }
    }

    return new NextResponse(data, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "CLOB request failed") },
      { status: 502 }
    )
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const DELETE = proxyRequest
export const PUT = proxyRequest
