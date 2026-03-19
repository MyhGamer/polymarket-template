import { NextRequest, NextResponse } from "next/server"
import * as crypto from "crypto"
import { rateLimit, getClientIp } from "@/lib/rateLimit"
import { getAuthenticatedAddress } from "@/lib/serverAuth"

const RELAYER_HOST = "https://relayer-v2.polymarket.com"

const RATE_LIMIT = 30
const RATE_WINDOW = 10_000

// Maximum request body size (50KB)
const MAX_BODY_SIZE = 50 * 1024

const ALLOWED_EXACT = new Set(["/nonce", "/relay-payload", "/submit", "/deployed"])
const ALLOWED_PREFIXES = ["/transaction", "/transactions"]

/** H1: Reject path segments that could traverse directories */
function hasPathTraversal(segments: string[]): boolean {
  return segments.some(s => s === ".." || s === "." || s === "")
}

// Allowed query parameters for relayer API
const ALLOWED_QUERY_PARAMS = new Set([
  "address", "safe_address", "nonce", "transaction_hash", "type", "id",
])

function validateQueryParams(searchParams: URLSearchParams): string | null {
  for (const [key] of searchParams) {
    if (!ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) {
      return `Unexpected query parameter: ${key}`
    }
  }
  return null
}

function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string
): string {
  let message = `${timestamp}${method}${requestPath}`
  if (body !== undefined) {
    message += body
  }

  let paddedSecret = secret
  const padding = paddedSecret.length % 4
  if (padding > 0) paddedSecret += "=".repeat(4 - padding)

  const key = Buffer.from(paddedSecret, "base64")
  const sig = crypto.createHmac("sha256", key).update(message).digest("base64")

  return sig.replace(/\+/g, "-").replace(/\//g, "_")
}

function createBuilderHeaders(
  method: string,
  path: string,
  body?: string
): Record<string, string> {
  const apiKey = process.env.POLYMARKET_BUILDER_API_KEY
  const secret = process.env.POLYMARKET_BUILDER_SECRET
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

  if (!apiKey || !secret || !passphrase) {
    console.error("[RelayerProxy] Missing builder credentials in env")
    return {}
  }

  const ts = Math.floor(Date.now() / 1000)
  const signature = buildHmacSignature(secret, ts, method, path, body)

  return {
    POLY_BUILDER_API_KEY: apiKey,
    POLY_BUILDER_PASSPHRASE: passphrase,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${ts}`,
  }
}

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // C1: Require authenticated session (wallet signature verified via /api/auth/session)
  const authenticatedAddress = getAuthenticatedAddress(req)
  if (!authenticatedAddress) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  // C2: Rate limit per IP and per authenticated address
  const ip = getClientIp(req)
  const { allowed } = rateLimit(`relayer:${ip}`, RATE_LIMIT, RATE_WINDOW)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { allowed: addrAllowed } = rateLimit(`relayer:addr:${authenticatedAddress}`, RATE_LIMIT, RATE_WINDOW)
  if (!addrAllowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { path } = await params

  // H1: Path traversal protection
  if (hasPathTraversal(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const relayerPath = "/" + path.join("/")

  const isAllowed =
    ALLOWED_EXACT.has(relayerPath) ||
    ALLOWED_PREFIXES.some((prefix) => relayerPath === prefix || relayerPath.startsWith(prefix + "/"))
  if (!isAllowed) {
    return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 })
  }

  // Validate query parameters
  const queryError = validateQueryParams(req.nextUrl.searchParams)
  if (queryError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const method = req.method.toUpperCase()
  const isRead = method === "GET" || method === "HEAD"
  const url = new URL(relayerPath, RELAYER_HOST)

  req.nextUrl.searchParams.forEach((val, key) => {
    url.searchParams.set(key, val)
  })

  let bodyStr: string | undefined
  if (!isRead) {
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

  const builderHeaders = createBuilderHeaders(method, relayerPath, bodyStr)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...builderHeaders,
  }

  try {
    const resp = await fetch(url.toString(), {
      method,
      headers,
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(30000),
    })

    const data = await resp.text()

    // Sanitize error responses
    if (!resp.ok) {
      try {
        const parsed = JSON.parse(data)
        if (parsed.error && typeof parsed.error === "string") {
          return new NextResponse(data, {
            status: resp.status,
            headers: { "Content-Type": "application/json" },
          })
        }
      } catch {
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
  } catch {
    return NextResponse.json({ error: "Relayer request failed" }, { status: 502 })
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const DELETE = proxyRequest
export const PUT = proxyRequest
