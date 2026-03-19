"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useAccount } from "wagmi"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { getPositions, getClosedPositions, getActivity } from "@/lib/data-api"
import { deriveSafeAddress, redeemPosition, redeemAllPositions } from "@/lib/polymarket/relayer"
import { useOrders } from "@/hooks/use-orders"
import { useSession } from "@/hooks/use-session"
import { getMarketsInfoByTokenIds, type MarketInfo } from "@/lib/gamma"
import type { Position, ClosedPosition, Activity } from "@/lib/data-api"
import type { OpenOrder } from "@/lib/polymarket/trading"

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PnlCell({ value, percent }: { value: number; percent?: number }) {
  const color = value > 0 ? "text-teal-600 dark:text-teal-400" : value < 0 ? "text-red-600/80 dark:text-red-400" : "text-muted-foreground"
  return (
    <span className={color}>
      {value >= 0 ? "+" : ""}{formatUsd(value)}
      {percent !== undefined && (
        <span className="text-xs ml-1">({percent >= 0 ? "+" : ""}{percent.toFixed(1)}%)</span>
      )}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-muted-foreground text-sm">{message}</div>
}

function OrdersTable({
  orders,
  marketsInfo,
  cancelling,
  onCancel,
}: {
  orders: OpenOrder[]
  marketsInfo: Map<string, MarketInfo>
  cancelling: string | null
  onCancel: (orderId: string) => void
}) {
  if (orders.length === 0) return <EmptyState message="No open orders" />

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">Filled</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const marketInfo = marketsInfo.get(order.asset_id)
          const filled = parseFloat(order.size_matched || "0")
          const total = parseFloat(order.original_size || "0")
          const price = parseFloat(order.price || "0")

          return (
            <TableRow key={order.id} className="h-14">
              <TableCell>
                {marketInfo ? (
                  <Link href={`/${marketInfo.eventSlug}`} className="flex items-center gap-3 hover:underline">
                    {marketInfo.icon && <img src={marketInfo.icon} alt="" className="size-8 rounded-lg object-cover shrink-0" />}
                    <span className="text-sm font-medium line-clamp-1 max-w-xs">{marketInfo.question}</span>
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">Unknown market</span>
                )}
              </TableCell>
              <TableCell>
                <span className={`text-sm font-medium ${order.side === "BUY" ? "text-teal-600 dark:text-teal-400" : "text-red-600/80 dark:text-red-400"}`}>
                  {order.side}
                </span>
              </TableCell>
              <TableCell>
                <span className={`text-sm font-medium ${order.outcome === "Yes" ? "text-teal-600 dark:text-teal-400" : "text-red-600/80 dark:text-red-400"}`}>
                  {order.outcome}
                </span>
              </TableCell>
              <TableCell className="text-right text-sm">
                {filled.toFixed(0)}/{total.toFixed(0)}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">
                {(price * 100).toFixed(1)}¢
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  disabled={cancelling === order.id}
                  onClick={() => onCancel(order.id)}
                >
                  {cancelling === order.id ? <Spinner className="size-3" /> : "Cancel"}
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function PositionsTable({
  positions,
  redeemingId,
  onRedeem,
}: {
  positions: Position[]
  redeemingId: string | null
  onRedeem: (position: Position) => void
}) {
  if (positions.length === 0) return <EmptyState message="No open positions" />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Avg Price</TableHead>
          <TableHead className="text-right">Current</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => {
          const posKey = `${p.conditionId}-${p.outcomeIndex}`
          return (
            <TableRow key={posKey} className="h-14">
              <TableCell>
                <Link href={`/${p.eventSlug}`} className="flex items-center gap-3 hover:underline">
                  {p.icon && <img src={p.icon} alt="" className="size-8 rounded-lg object-cover shrink-0" />}
                  <span className="text-sm font-medium line-clamp-1 max-w-xs">{p.title}</span>
                </Link>
              </TableCell>
              <TableCell>
                <span className={`text-sm font-medium ${p.outcome === "Yes" ? "text-teal-600 dark:text-teal-400" : "text-red-600/80 dark:text-red-400"}`}>
                  {p.outcome}
                </span>
              </TableCell>
              <TableCell className="text-right text-sm">{p.size.toFixed(2)}</TableCell>
              <TableCell className="text-right text-sm">{(p.avgPrice * 100).toFixed(1)}¢</TableCell>
              <TableCell className="text-right text-sm font-medium">{formatUsd(p.currentValue)}</TableCell>
              <TableCell className="text-right text-sm">
                <PnlCell value={p.cashPnl} percent={p.percentPnl} />
              </TableCell>
              <TableCell className="text-right">
                {p.redeemable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                    disabled={redeemingId === posKey}
                    onClick={() => onRedeem(p)}
                  >
                    {redeemingId === posKey ? <Spinner className="size-3" /> : "Redeem"}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function ClosedTable({ positions }: { positions: ClosedPosition[] }) {
  if (positions.length === 0) return <EmptyState message="No closed positions" />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">Avg Price</TableHead>
          <TableHead className="text-right">Invested</TableHead>
          <TableHead className="text-right">Realized P&L</TableHead>
          <TableHead className="text-right">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => (
          <TableRow key={`${p.conditionId}-${p.outcomeIndex}`} className="h-14">
            <TableCell>
              <Link href={`/${p.eventSlug}`} className="flex items-center gap-3 hover:underline">
                {p.icon && <img src={p.icon} alt="" className="size-8 rounded-lg object-cover shrink-0" />}
                <span className="text-sm font-medium line-clamp-1 max-w-xs">{p.title}</span>
              </Link>
            </TableCell>
            <TableCell>
              <span className={`text-sm font-medium ${p.outcome === "Yes" ? "text-teal-600 dark:text-teal-400" : "text-red-600/80 dark:text-red-400"}`}>
                {p.outcome}
              </span>
            </TableCell>
            <TableCell className="text-right text-sm">{(p.avgPrice * 100).toFixed(1)}¢</TableCell>
            <TableCell className="text-right text-sm">{formatUsd(p.totalBought)}</TableCell>
            <TableCell className="text-right text-sm">
              <PnlCell value={p.realizedPnl} />
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">
              {new Date(p.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ActivityTable({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <EmptyState message="No activity" />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((a, i) => (
          <TableRow key={`${a.transactionHash}-${i}`} className="h-14">
            <TableCell>
              <Link href={`/${a.eventSlug}`} className="flex items-center gap-3 hover:underline">
                {a.icon && <img src={a.icon} alt="" className="size-8 rounded-lg object-cover shrink-0" />}
                <span className="text-sm font-medium line-clamp-1 max-w-xs">{a.title}</span>
              </Link>
            </TableCell>
            <TableCell>
              <span className="text-xs rounded-full bg-muted px-2 py-0.5 font-medium">{a.type}</span>
            </TableCell>
            <TableCell>
              <span className={`text-sm font-medium ${a.side === "BUY" ? "text-teal-600 dark:text-teal-400" : "text-red-600/80 dark:text-red-400"}`}>
                {a.side}
              </span>
            </TableCell>
            <TableCell className="text-sm">{a.outcome}</TableCell>
            <TableCell className="text-right text-sm font-medium">{formatUsd(a.usdcSize)}</TableCell>
            <TableCell className="text-right text-sm">{(a.price * 100).toFixed(1)}¢</TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">
              {new Date(a.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function PortfolioPositions() {
  const { address } = useAccount()
  const walletAddr = address ? deriveSafeAddress(address) : undefined
  const { getRelayClient } = useSession()

  const [positions, setPositions] = useState<Position[]>([])
  const [closed, setClosed] = useState<ClosedPosition[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [redeemAllLoading, setRedeemAllLoading] = useState(false)

  const {
    orders,
    loading: ordersLoading,
    cancelling,
    fetchOrders,
    cancelSingleOrder,
    hasStoredCredentials,
    isSessionReady,
  } = useOrders()

  const [marketsInfo, setMarketsInfo] = useState<Map<string, MarketInfo>>(new Map())

  useEffect(() => {
    if (!walletAddr) {
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all([
      getPositions(walletAddr),
      getClosedPositions(walletAddr),
      getActivity(walletAddr),
    ]).then(([pos, cls, act]) => {
      setPositions(pos)
      setClosed(cls.sort((a, b) => b.timestamp - a.timestamp))
      setActivities(act)
    }).finally(() => setLoading(false))
  }, [walletAddr])

  useEffect(() => {
    if (orders.length === 0) return

    // Get unique asset IDs (token IDs) from orders
    const assetIds = [...new Set(orders.map((o) => o.asset_id))]
    getMarketsInfoByTokenIds(assetIds).then((info) => {
      setMarketsInfo(info)
    })
  }, [orders])

  const refreshPositions = useCallback(() => {
    if (!walletAddr) return
    Promise.all([
      getPositions(walletAddr),
      getClosedPositions(walletAddr),
      getActivity(walletAddr),
    ]).then(([pos, cls, act]) => {
      setPositions(pos)
      setClosed(cls.sort((a, b) => b.timestamp - a.timestamp))
      setActivities(act)
    })
  }, [walletAddr])

  const handleRedeem = useCallback(async (position: Position) => {
    const relayClient = getRelayClient()
    if (!relayClient) {
      toast.error("Session not ready. Please connect your wallet first.")
      return
    }

    const posKey = `${position.conditionId}-${position.outcomeIndex}`
    setRedeemingId(posKey)
    toast.loading("Redeeming position...", { id: "redeem" })

    try {
      await redeemPosition(
        relayClient,
        position.conditionId,
        position.negativeRisk ?? false,
        position.size,
        position.outcomeIndex,
      )
      toast.success("Position redeemed!", { id: "redeem" })
      refreshPositions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Redeem failed"
      toast.error(msg, { id: "redeem" })
    } finally {
      setRedeemingId(null)
    }
  }, [getRelayClient, refreshPositions])

  const handleRedeemAll = useCallback(async () => {
    const relayClient = getRelayClient()
    if (!relayClient) {
      toast.error("Session not ready. Please connect your wallet first.")
      return
    }

    const redeemable = positions.filter((p) => p.redeemable)
    if (redeemable.length === 0) return

    setRedeemAllLoading(true)
    toast.loading(`Redeeming ${redeemable.length} positions...`, { id: "redeem-all" })

    try {
      const results = await redeemAllPositions(
        relayClient,
        redeemable.map((p) => ({
          conditionId: p.conditionId,
          negRisk: p.negativeRisk ?? false,
          size: p.size,
          outcomeIndex: p.outcomeIndex,
        })),
      )

      if (results.success > 0 && results.failed === 0) {
        toast.success(`Redeemed ${results.success} positions!`, { id: "redeem-all" })
      } else if (results.success > 0) {
        toast.success(`Redeemed ${results.success}/${results.success + results.failed}. ${results.errors[0] || ""}`, { id: "redeem-all" })
      } else {
        toast.error(`Redeem failed: ${results.errors[0] || "Unknown error"}`, { id: "redeem-all" })
      }

      refreshPositions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Redeem all failed"
      toast.error(msg, { id: "redeem-all" })
    } finally {
      setRedeemAllLoading(false)
    }
  }, [getRelayClient, positions, refreshPositions])

  const redeemableCount = positions.filter((p) => p.redeemable).length

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const success = await cancelSingleOrder(orderId)
    if (success) {
      fetchOrders()
    }
  }, [cancelSingleOrder, fetchOrders])

  if (!walletAddr) {
    return <EmptyState message="Connect your wallet to view positions" />
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner className="size-6" /></div>
  }

  return (
    <Tabs defaultValue="positions">
      <TabsList variant="line">
        <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
        <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
        <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
        <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="positions" className="pt-2">
        {redeemableCount > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-950/30"
              disabled={redeemAllLoading}
              onClick={handleRedeemAll}
            >
              {redeemAllLoading ? <Spinner className="size-3 mr-1.5" /> : null}
              Redeem All ({redeemableCount})
            </Button>
          </div>
        )}
        <PositionsTable positions={positions} redeemingId={redeemingId} onRedeem={handleRedeem} />
      </TabsContent>
      <TabsContent value="orders" className="pt-2">
        {ordersLoading ? (
          <div className="flex justify-center py-16"><Spinner className="size-6" /></div>
        ) : !hasStoredCredentials && !isSessionReady ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-sm text-muted-foreground">Load your orders to view and manage them</p>
            <Button onClick={fetchOrders} size="sm">
              Load Orders
            </Button>
          </div>
        ) : (
          <OrdersTable
            orders={orders}
            marketsInfo={marketsInfo}
            cancelling={cancelling}
            onCancel={handleCancelOrder}
          />
        )}
      </TabsContent>
      <TabsContent value="closed" className="pt-2">
        <ClosedTable positions={closed} />
      </TabsContent>
      <TabsContent value="activity" className="pt-2">
        <ActivityTable activities={activities} />
      </TabsContent>
    </Tabs>
  )
}
