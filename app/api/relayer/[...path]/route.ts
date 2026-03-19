import { NextRequest, NextResponse } from "next/server"
import * as crypto from "crypto"

const RELAYER_HOST = "https://relayer-v2.polymarket.com"

const ALLOWED_EXACT = new Set(["/nonce", "/relay-payload", "/submit", "/deployed"])
const ALLOWED_PREFIXES = ["/transaction", "/transactions"]

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
  const { path } = await params
  const relayerPath = "/" + path.join("/")

  const isAllowed =
    ALLOWED_EXACT.has(relayerPath) ||
    ALLOWED_PREFIXES.some((prefix) => relayerPath === prefix || relayerPath.startsWith(prefix + "/"))
  if (!isAllowed) {
    return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 })
  }

  const method = req.method.toUpperCase()
  const isRead = method === "GET" || method === "HEAD"
  const url = new URL(relayerPath, RELAYER_HOST)

  req.nextUrl.searchParams.forEach((val, key) => {
    url.searchParams.set(key, val)
  })

  let bodyStr: string | undefined
  if (!isRead) {
    bodyStr = await req.text()
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
