"use client"

import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client"
import { CHAIN_ID, CLOB_URL } from "./constants"

const isDev = process.env.NODE_ENV === "development"
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

export type TradeParams = {
  tokenId: string
  side: "yes" | "no"
  action: "buy" | "sell"
  amount: number
  price: number
  isLimitBuy?: boolean
  negRisk?: boolean
  estimatedPrice?: number
}

export type ApiCredentials = {
  key: string
  secret: string
  passphrase: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrCreateApiCredentials(signer: any): Promise<ApiCredentials> {
  const tempClient = new ClobClient(CLOB_URL, CHAIN_ID, signer)

  // Try to derive existing API key first (1 wallet signature).
  // deriveApiKey succeeds for wallets that already have keys on the CLOB.
  try {
    const derived = await tempClient.deriveApiKey()
    if (derived?.key && derived?.secret && derived?.passphrase) {
      devLog("[API] Derived existing API credentials")
      return derived
    }
  } catch (err: unknown) {
    // Check if this is a user-rejection (don't fall through to createApiKey)
    const msg = (err as { code?: number; message?: string })?.message ?? ""
    const code = (err as { code?: number })?.code
    if (code === 4001 || msg.includes("rejected") || msg.includes("denied") || msg.includes("cancelled")) {
      devLog("[API] User rejected deriveApiKey signature")
      throw err
    }
    // Any other error: key doesn't exist yet → create
    devLog("[API] No existing API key, will create new one")
  }

  // Create new API key (1 wallet signature – only reached if derive found nothing)
  devLog("[API] Creating new API credentials...")
  return tempClient.createApiKey()
}

// Builder auth is handled server-side via /api/clob proxy
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTradingClient(signer: any, apiCreds: ApiCredentials, safeAddress: string) {
  return new ClobClient(
    CLOB_URL,
    CHAIN_ID,
    signer,
    apiCreds,
    2,
    safeAddress,
  )
}

const MIN_SHARES = 5

export async function placeOrder(
  client: ClobClient,
  params: TradeParams,
) {
  if (isNaN(params.price) || isNaN(params.amount) || params.price <= 0 || params.amount <= 0) {
    throw new Error(`Invalid order params: price=${params.price}, amount=${params.amount}`)
  }

  const isLimitOrder = params.isLimitBuy || false
  const isMarketOrder = !isLimitOrder
  const side = params.action === "sell" ? Side.SELL : Side.BUY
  const negRisk = params.negRisk || false

  // Refresh balance/allowance cache before each order (Polymarket CLOB cache bug workaround)
  try {
    devLog("[Trade] Refreshing balance allowance cache...")
    const balRes = await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL })
    devLog("[Trade] Balance cache refreshed:", balRes)
    await new Promise(r => setTimeout(r, 500))
  } catch (err) {
    console.warn("[Trade] updateBalanceAllowance failed (non-critical):", extractErrorMessage(err))
  }

  let orderAmount = params.amount

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let order: any

  if (isMarketOrder) {
    // Market order: use createMarketOrder + postOrder with FAK
    const estPrice = params.estimatedPrice || params.price || 0.5
    let limitPrice: number
    if (params.action === "buy") {
      limitPrice = Math.min(estPrice * 1.20, 0.99)
      const estShares = params.amount / estPrice
      if (estShares < MIN_SHARES) {
        throw new Error(`Minimum order size is ${MIN_SHARES} shares. Your order would buy ~${estShares.toFixed(1)} shares. Increase your amount to at least $${(MIN_SHARES * estPrice).toFixed(2)}.`)
      }
    } else {
      limitPrice = Math.max(estPrice * 0.80, 0.01)
      if (params.amount < MIN_SHARES) {
        throw new Error(`Minimum order size is ${MIN_SHARES} shares. You're trying to sell ${params.amount.toFixed(1)} shares.`)
      }
      // SELL workaround: use 99% of amount to avoid CLOB balance cache mismatch (after min check)
      orderAmount = Math.floor(params.amount * 0.99 * 100) / 100
      devLog(`[Trade] SELL 99% workaround: ${params.amount} -> ${orderAmount}`)
    }

    devLog(`[Trade] Market FAK ${params.action.toUpperCase()} ${orderAmount} @ ${limitPrice} (est: ${estPrice})`)

    order = await client.createMarketOrder({
      tokenID: params.tokenId,
      amount: Math.floor(orderAmount * 100) / 100,
      price: limitPrice,
      side,
    }, { negRisk })

    const response = await postOrderWithRetry(client, order, OrderType.FAK, negRisk)
    return response
  } else {
    // Limit order: use createOrder + postOrder with GTC
    const limitPrice = params.price
    if (!limitPrice || limitPrice <= 0 || limitPrice >= 1) {
      throw new Error("Invalid limit price. Must be between 0.01 and 0.99")
    }

    // SELL workaround for limit orders: apply 99% after min check
    if (params.action === "sell") {
      orderAmount = Math.floor(params.amount * 0.99 * 100) / 100
      devLog(`[Trade] SELL limit 99% workaround: ${params.amount} -> ${orderAmount}`)
    }
    const size = Math.floor(orderAmount)
    if (size < MIN_SHARES) {
      throw new Error(`Minimum order size is ${MIN_SHARES} shares. You entered ${Math.floor(params.amount)} shares.`)
    }

    devLog(`[Trade] Limit GTC ${params.action.toUpperCase()} ${size} shares @ ${limitPrice}`)

    order = await client.createOrder({
      tokenID: params.tokenId,
      price: limitPrice,
      size,
      side,
    }, { negRisk })

    const response = await postOrderWithRetry(client, order, OrderType.GTC, negRisk)
    return response
  }
}

// Extract error message from axios/CLOB errors (nested in response.data.error)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractErrorMessage(err: any): string {
  // Axios error: err.response.data.error or err.response.data
  const dataError = err?.response?.data?.error
  if (typeof dataError === "string") return dataError
  const data = err?.response?.data
  if (typeof data === "string") return data
  // Standard error
  if (err instanceof Error) return err.message
  return String(err)
}

function isBalanceCacheError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase()
  return lower.includes("not enough balance") || lower.includes("allowance")
}

// Retry wrapper for CLOB balance cache bug
async function postOrderWithRetry(
  client: ClobClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any,
  orderType: OrderType,
  _negRisk: boolean,
) {
  try {
    return await client.postOrder(order, orderType)
  } catch (err: unknown) {
    const errorMsg = extractErrorMessage(err)

    if (isBalanceCacheError(errorMsg)) {
      devLog("[Trade] CLOB balance cache error, retrying with delay...")

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          devLog(`[Trade] Retry attempt ${attempt}/3, waiting ${attempt * 2}s...`)
          await new Promise(r => setTimeout(r, attempt * 2000))
          await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL })
          const response = await client.postOrder(order, orderType)
          devLog(`[Trade] Retry ${attempt} success:`, response)
          return response
        } catch (retryErr) {
          const retryMsg = extractErrorMessage(retryErr)
          devError(`[Trade] Retry ${attempt} failed:`, retryMsg)
        }
      }

      throw new Error("Balance cache error. Please wait a few seconds and try again.")
    }

    throw new Error(errorMsg)
  }
}

export interface OpenOrder {
  id: string
  market: string
  asset_id: string
  side: string
  original_size: string
  size_matched: string
  price: string
  outcome: string
  expiration: string
  created_at: number
}

export async function getOpenOrders(client: ClobClient): Promise<OpenOrder[]> {
  const response = await client.getOpenOrders()
  return response as unknown as OpenOrder[]
}

export async function cancelOrder(client: ClobClient, orderId: string): Promise<{ canceled: string[]; failed: Record<string, string> }> {
  return client.cancelOrder({ orderID: orderId })
}

export async function cancelAllOrders(client: ClobClient): Promise<{ canceled: string[]; failed: Record<string, string> }> {
  return client.cancelAll()
}
