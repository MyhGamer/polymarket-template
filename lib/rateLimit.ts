/**
 * Simple in-memory sliding window rate limiter
 *
 * NOTE: This rate limiter uses in-memory storage which does NOT work reliably
 * in serverless environments (Vercel, Netlify Functions, etc.) because:
 * - Each function invocation may run on a different instance
 * - Memory is not shared between instances
 *
 * For production serverless deployments, consider using:
 * - Upstash Redis (https://upstash.com)
 * - Vercel KV (https://vercel.com/storage/kv)
 * - Cloudflare Durable Objects
 * - Any distributed cache/redis solution
 *
 * For now, this provides basic protection against simple attacks.
 */

const windows = new Map<string, { count: number; resetAt: number }>()

let lastCleanup = Date.now()
function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, val] of windows) {
    if (val.resetAt < now) windows.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  cleanup()
  const now = Date.now()
  const entry = windows.get(key)

  if (!entry || entry.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1 }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count }
}

/**
 * Extract client IP from request headers.
 *
 * SECURITY NOTE: In serverless environments (Vercel, etc.), x-forwarded-for
 * can be spoofed if not properly configured at the platform level.
 *
 * Vercel automatically sets x-vercel-forwarded-for which is more reliable.
 * For maximum security, configure your hosting platform to:
 * 1. Overwrite x-forwarded-for with the actual client IP
 * 2. Use a trusted proxy chain configuration
 */
export function getClientIp(req: Request): string {
  // Try Vercel's specific header first (more reliable)
  const vercelForwarded = req.headers.get("x-vercel-forwarded-for")
  if (vercelForwarded) {
    return vercelForwarded.split(",")[0]?.trim() || "unknown"
  }

  // Fallback to standard x-forwarded-for
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }

  // Last resort
  return "unknown"
}
