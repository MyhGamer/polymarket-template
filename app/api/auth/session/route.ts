import { NextRequest, NextResponse } from "next/server"
import { recoverMessageAddress } from "viem"
import {
  createSessionToken,
  buildAuthMessage,
  SESSION_COOKIE_NAME,
  MAX_SIGNATURE_AGE_SECONDS,
} from "@/lib/serverAuth"
import { rateLimit, getClientIp } from "@/lib/rateLimit"

function isValidEthAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

export async function POST(req: NextRequest) {
  // Rate limit auth attempts (10 per minute per IP)
  const ip = getClientIp(req)
  const { allowed } = rateLimit(`auth:${ip}`, 10, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  try {
    const body = await req.json()
    const { address, signature, timestamp } = body

    if (!address || !signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      )
    }

    // Validate timestamp is recent (prevent replay attacks)
    const ts = parseInt(timestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (isNaN(ts) || Math.abs(now - ts) > MAX_SIGNATURE_AGE_SECONDS) {
      return NextResponse.json(
        { error: "Signature expired" },
        { status: 401 }
      )
    }

    // Reconstruct the message and verify signature
    const message = buildAuthMessage(address, ts)

    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    })

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      )
    }

    // Create session token and set HttpOnly cookie
    const token = createSessionToken(address)

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60,
      path: "/",
    })

    return response
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
