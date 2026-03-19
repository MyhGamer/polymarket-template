import * as crypto from "crypto"

const API_KEY = process.env.POLYMARKET_BUILDER_API_KEY || ""
const SECRET = process.env.POLYMARKET_BUILDER_SECRET || ""
const PASSPHRASE = process.env.POLYMARKET_BUILDER_PASSPHRASE || ""

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

  // Pad base64 secret if needed
  let paddedSecret = secret
  const padding = paddedSecret.length % 4
  if (padding > 0) paddedSecret += "=".repeat(4 - padding)

  const key = Buffer.from(paddedSecret, "base64")
  const sig = crypto.createHmac("sha256", key).update(message).digest("base64")

  // URL-safe base64
  return sig.replace(/\+/g, "-").replace(/\//g, "_")
}

export function createBuilderHeaders(
  method: string,
  path: string,
  body?: string
): Record<string, string> {
  if (!API_KEY || !SECRET || !PASSPHRASE) {
    console.error("[BuilderSign] Missing builder credentials in env")
    return {}
  }

  const ts = Math.floor(Date.now() / 1000)
  const signature = buildHmacSignature(SECRET, ts, method, path, body)

  return {
    POLY_BUILDER_API_KEY: API_KEY,
    POLY_BUILDER_PASSPHRASE: PASSPHRASE,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${ts}`,
  }
}
