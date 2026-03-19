import "server-only"
import * as crypto from "crypto"
import { NextRequest } from "next/server"

/**
 * Server-side session authentication using HMAC tokens stored in HttpOnly cookies.
 *
 * Flow:
 * 1. Client signs a message with their wallet proving ownership
 * 2. Server verifies the signature via /api/auth/session
 * 3. Server creates an HMAC session token and sets it as an HttpOnly cookie
 * 4. Proxy routes validate the cookie before attaching builder credentials
 */

const AUTH_SECRET = process.env.POLYMARKET_BUILDER_SECRET || ""
const SESSION_DURATION_SECONDS = 24 * 60 * 60 // 24 hours

export const SESSION_COOKIE_NAME = "poly_session"

/**
 * The message the client must sign to authenticate.
 * Timestamp is included to prevent replay attacks.
 */
export function buildAuthMessage(address: string, timestamp: number): string {
  return `Sign in to Polymarket Trading\n\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`
}

/** Maximum age of signature timestamp (5 minutes) */
export const MAX_SIGNATURE_AGE_SECONDS = 300

export function createSessionToken(address: string): string {
  const normalizedAddress = address.toLowerCase()
  const timestamp = Math.floor(Date.now() / 1000)
  const payload = `${normalizedAddress}:${timestamp}`
  const hmac = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("hex")
  return Buffer.from(`${payload}:${hmac}`).toString("base64url")
}

export function validateSessionToken(token: string): {
  valid: boolean
  address?: string
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString()
    const lastColon = decoded.lastIndexOf(":")
    if (lastColon === -1) return { valid: false }

    const secondLastColon = decoded.lastIndexOf(":", lastColon - 1)
    if (secondLastColon === -1) return { valid: false }

    const address = decoded.slice(0, secondLastColon)
    const timestampStr = decoded.slice(secondLastColon + 1, lastColon)
    const providedHmac = decoded.slice(lastColon + 1)

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) return { valid: false }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (now - timestamp > SESSION_DURATION_SECONDS) return { valid: false }

    // Verify HMAC
    const payload = `${address}:${timestampStr}`
    const expectedHmac = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(payload)
      .digest("hex")

    if (providedHmac.length !== expectedHmac.length) return { valid: false }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    )

    return isValid ? { valid: true, address } : { valid: false }
  } catch {
    return { valid: false }
  }
}

/**
 * Extract the authenticated wallet address from request cookies.
 * Returns null if no valid session exists.
 */
export function getAuthenticatedAddress(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const result = validateSessionToken(token)
  return result.valid ? (result.address ?? null) : null
}
