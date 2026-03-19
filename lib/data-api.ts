const DATA_API_BASE = "https://data-api.polymarket.com"

export interface Position {
  proxyWallet: string
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  initialValue: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  redeemable: boolean
  mergeable: boolean
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  endDate: string
  negativeRisk: boolean
}

export interface ClosedPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  timestamp: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
}

export interface Activity {
  proxyWallet: string
  timestamp: number
  conditionId: string
  type: "TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION" | "MAKER_REBATE"
  size: number
  usdcSize: number
  transactionHash: string
  price: number
  asset: string
  side: "BUY" | "SELL"
  outcomeIndex: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
}

export async function getPositions(user: string): Promise<Position[]> {
  const res = await fetch(`${DATA_API_BASE}/positions?user=${user}&limit=100&sizeThreshold=0.01`)
  if (!res.ok) return []
  return res.json()
}

export async function getClosedPositions(user: string): Promise<ClosedPosition[]> {
  const res = await fetch(`${DATA_API_BASE}/closed-positions?user=${user}&limit=50`)
  if (!res.ok) return []
  return res.json()
}

export async function getActivity(user: string): Promise<Activity[]> {
  const res = await fetch(`${DATA_API_BASE}/activity?user=${user}&limit=100`)
  if (!res.ok) return []
  return res.json()
}
