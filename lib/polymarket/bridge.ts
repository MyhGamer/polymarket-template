"use client"

const BRIDGE_API_URL = "https://bridge.polymarket.com"

export interface DepositAddresses {
  evm: string
  svm: string
  btc: string
  note: string
}

export interface SupportedAsset {
  chainId: string
  chainName: string
  token: {
    name: string
    symbol: string
    address: string
    decimals: number
  }
  minCheckoutUsd: number
}

export interface QuoteResponse {
  quoteId: string
  estCheckoutTimeMs: number
  estInputUsd: number
  estOutputUsd: number
  estToTokenBaseUnit: string
  estFeeBreakdown: {
    gas: number
    slippage: number
    swapImpact: number
    appFee: number
  }
}

export interface Transaction {
  fromChainId: string
  fromTokenAddress: string
  fromAmountBaseUnit: string
  toChainId: string
  toTokenAddress: string
  status: "DEPOSIT_DETECTED" | "PROCESSING" | "ORIGIN_TX_CONFIRMED" | "SUBMITTED" | "COMPLETED" | "FAILED"
  txHash?: string
  createdTimeMs?: number
}

export async function createDepositAddress(
  address: string
): Promise<DepositAddresses> {
  const response = await fetch(`${BRIDGE_API_URL}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to create deposit address: ${response.statusText}`)
  }

  const data = await response.json()
  return {
    evm: data.address?.evm ?? "",
    svm: data.address?.svm ?? "",
    btc: data.address?.btc ?? "",
    note: data.note ?? "",
  }
}

export async function createWithdrawalAddress(
  address: string,
  toChainId: string,
  toTokenAddress: string,
  recipientAddr: string
): Promise<DepositAddresses> {
  const response = await fetch(`${BRIDGE_API_URL}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, toChainId, toTokenAddress, recipientAddr }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to create withdrawal address: ${response.statusText}`)
  }

  const data = await response.json()
  return {
    evm: data.address?.evm ?? "",
    svm: data.address?.svm ?? "",
    btc: data.address?.btc ?? "",
    note: data.note ?? "",
  }
}

export async function getSupportedAssets(): Promise<SupportedAsset[]> {
  const response = await fetch(`${BRIDGE_API_URL}/supported-assets`)

  if (!response.ok) {
    throw new Error(`Failed to get supported assets: ${response.statusText}`)
  }

  const data = await response.json()
  return data.supportedAssets || []
}

export async function getQuote(params: {
  fromChainId: string
  fromTokenAddress: string
  toChainId: string
  toTokenAddress: string
  fromAmountBaseUnit: string
  recipientAddress: string
}): Promise<QuoteResponse> {
  const response = await fetch(`${BRIDGE_API_URL}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to get quote: ${response.statusText}`)
  }

  return response.json()
}

export async function getTransactionStatus(
  address: string
): Promise<{ transactions: Transaction[] }> {
  const response = await fetch(`${BRIDGE_API_URL}/status/${encodeURIComponent(address)}`)

  if (!response.ok) {
    throw new Error(`Failed to get transaction status: ${response.statusText}`)
  }

  return response.json()
}
