"use client"

import { useState, useEffect, useCallback } from "react"
import confetti from "canvas-confetti"
import { useAccount, useConnect, useWalletClient, useSwitchChain } from "wagmi"
import { injected } from "wagmi/connectors"
import { toast } from "sonner"
import { parseUnits } from "viem"
import { polygon } from "viem/chains"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { Market } from "@/lib/gamma"
import { parsePrices } from "@/lib/prices"
import { placeOrder } from "@/lib/polymarket/trading"
import { useSession } from "@/hooks/use-session"
import { useUsdcBalance } from "@/hooks/use-usdc-balance"
import { usePositionBalance } from "@/hooks/use-position-balance"
import { deriveSafeAddress, transferToSafe } from "@/lib/polymarket/relayer"

export function TradeCard({
  markets,
  selectedMarketId,
  selectedSide,
  limitPrice: externalLimitPrice,
  onTradeComplete,
}: {
  markets: Market[]
  selectedMarketId?: string
  selectedSide?: "yes" | "no"
  limitPrice?: number | null
  onTradeComplete?: () => void
}) {
  const [tab, setTab] = useState<"buy" | "sell">("buy")
  const [side, setSide] = useState<"yes" | "no">(selectedSide ?? "yes")
  const [amount, setAmount] = useState(0)
  const [orderType, setOrderType] = useState<"market" | "limit">("market")
  const [customPrice, setCustomPrice] = useState<number | null>(null)
  const [limitPriceInput, setLimitPriceInput] = useState("")
  const [limitPriceFocused, setLimitPriceFocused] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const { isReady, isInitializing, runFullSetup, getClient, l2Ready, approvalsSet, isDeployed } = useSession()
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)

  const safeAddress = address ? deriveSafeAddress(address) : undefined

  const { balance: rawSafeBalance, loading: safeBalanceLoading } = useUsdcBalance(safeAddress)
  const safeBalanceNum = rawSafeBalance ? Number(rawSafeBalance) : 0

  const { balance: rawEoaBalance } = useUsdcBalance(address)
  const eoaBalanceNum = rawEoaBalance ? Number(rawEoaBalance) : 0
  const hasEoaFunds = isConnected && eoaBalanceNum > 0 && safeBalanceNum === 0

  const market = markets.find((m) => m.id === selectedMarketId) ?? markets[0]
  let tokenIds: string[] = []
  try {
    if (market) tokenIds = JSON.parse(market.clobTokenIds) as string[]
  } catch {}
  const tokenId = side === "yes" ? tokenIds[0] : tokenIds[1]

  const { balance: rawPositionBalance, loading: positionBalanceLoading } = usePositionBalance(safeAddress, tokenId)
  const positionBalanceNum = rawPositionBalance ? Number(rawPositionBalance) : 0

  const isBuy = tab === "buy"
  const isLimitBuy = isBuy && orderType === "limit"
  const amountInShares = isLimitBuy || !isBuy
  const balanceNum = isBuy ? safeBalanceNum : positionBalanceNum
  const balanceLoading = isBuy ? safeBalanceLoading : positionBalanceLoading
  const balanceLabel = isBuy ? "Balance" : "Shares"
  const balanceDisplay = isBuy
    ? `$${balanceNum.toFixed(2)}`
    : `${balanceNum.toFixed(balanceNum < 1 ? 6 : 2)}`

  useEffect(() => {
    if (selectedSide) setSide(selectedSide)
  }, [selectedSide])

  // When external limit price is set from orderbook click, switch to limit mode
  useEffect(() => {
    if (externalLimitPrice != null) {
      setOrderType("limit")
      setCustomPrice(externalLimitPrice)
      setLimitPriceInput((externalLimitPrice * 100).toFixed(1))
    }
  }, [externalLimitPrice])

  useEffect(() => {
    if (error && !isPlacingOrder) {
      toast.error(error)
    }
  }, [error, isPlacingOrder])

  if (!market) return null

  const [yesPrice, noPrice] = parsePrices(market)
  const yesCents = (yesPrice * 100).toFixed(1)
  const noCents = (noPrice * 100).toFixed(1)
  const marketPrice = side === "yes" ? yesPrice : noPrice
  const price = orderType === "limit" && customPrice !== null ? customPrice : marketPrice
  // For limit buy: amount is shares, total = shares * price
  // For market buy: amount is dollars, total = amount
  // For sell: amount is shares
  const shares = isLimitBuy ? amount : (isBuy ? (price > 0 ? amount / price : 0) : amount)
  const total = isLimitBuy ? amount * price : amount
  const toWin = price > 0 ? (shares - total) : 0
  const label = market.groupItemTitle || market.question

  const handleTrade = async () => {
    if (!isConnected) {
      connect({ connector: injected() })
      return
    }

    if (!tokenId || amount <= 0) return
    if (orderType === "limit" && (customPrice === null || customPrice <= 0)) {
      toast.error("Set a limit price")
      return
    }

    setIsPlacingOrder(true)
    setError(null)

    const sideLabel = side === "yes" ? "Yes" : "No"
    const actionLabel = isBuy ? "Buying" : "Selling"
    const typeLabel = orderType === "limit" ? " (Limit)" : ""
    const toastId = toast.loading(`${actionLabel} ${sideLabel}${typeLabel}...`)

    try {
      // Ensure session is ready (uses cached state, won't re-run completed steps)
      let client = getClient()
      if (!client) {
        toast.loading("Setting up trading session...", { id: toastId })
        const success = await runFullSetup()
        if (!success) {
          toast.error("Failed to initialize trading session", { id: toastId })
          setIsPlacingOrder(false)
          return
        }
        client = getClient()
      }
      if (!client) {
        toast.error("Trading client not available", { id: toastId })
        setIsPlacingOrder(false)
        return
      }

      const result = await placeOrder(client, {
        tokenId,
        side,
        action: tab,
        amount,
        price,
        isLimitBuy,
        negRisk: market.negRisk || false,
        estimatedPrice: marketPrice,
      })

      if (result) {
        const end = Date.now() + 800
        const frame = () => {
          confetti({
            particleCount: 4,
            angle: 120,
            spread: 60,
            startVelocity: 40,
            origin: { x: 1, y: 0.5 },
          })
          if (Date.now() < end) requestAnimationFrame(frame)
        }
        frame()
        toast.success(
          isBuy
            ? `Bought ${shares.toFixed(2)} ${sideLabel} for $${total.toFixed(2)}`
            : `Sold ${amount} ${sideLabel} shares`,
          {
            id: toastId,
            description: isBuy
              ? `Potential payout: $${shares.toFixed(2)}`
              : `Est. return: $${(amount * price).toFixed(2)}`,
          },
        )
        setAmount(0)
        // Refresh all balances and positions multiple times as chain updates
        for (const delay of [2000, 5000, 10000]) {
          setTimeout(() => {
            window.dispatchEvent(new Event("poly:refresh"))
            onTradeComplete?.()
          }, delay)
        }
      } else {
        toast.error("Order failed", {
          id: toastId,
          description: "Something went wrong. Please try again.",
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order failed"
      setError(message)
      toast.error("Order failed", {
        id: toastId,
        description: message,
      })
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const handleTransferToSafe = useCallback(async () => {
    if (!address || !safeAddress || eoaBalanceNum <= 0 || !walletClient) return

    setIsTransferring(true)
    const toastId = toast.loading(`Transferring $${eoaBalanceNum.toFixed(2)} to trading wallet...`)

    try {
      await switchChainAsync({ chainId: polygon.id })

      const amountRaw = parseUnits(rawEoaBalance!, 6)
      await transferToSafe(walletClient, safeAddress, amountRaw)

      toast.success(`Transferred $${eoaBalanceNum.toFixed(2)} to trading wallet`, { id: toastId })
      for (const delay of [2000, 5000, 10000]) {
        setTimeout(() => window.dispatchEvent(new Event("poly:refresh")), delay)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed"
      toast.error(msg, { id: toastId })
    } finally {
      setIsTransferring(false)
    }
  }, [address, safeAddress, eoaBalanceNum, rawEoaBalance, walletClient, switchChainAsync])

  const isLoading = isPlacingOrder || isInitializing
  const insufficientBalance = isConnected && amount > 0 && (isLimitBuy ? total > balanceNum : amount > balanceNum)

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex border-b">
          <button
            onClick={() => { setTab("buy"); setAmount(0) }}
            className={`px-4 pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "buy"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => { setTab("sell"); setAmount(0) }}
            className={`px-4 pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "sell"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Sell
          </button>
        </div>
        {/* Market / Limit toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-full p-0.5">
          <button
            onClick={() => { setOrderType("market"); setCustomPrice(null) }}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              orderType === "market"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType("limit")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              orderType === "limit"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Limit
          </button>
        </div>
      </div>

      <h3 className="font-semibold text-lg mt-4 line-clamp-2">{label}</h3>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={() => setSide("yes")}
          className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            side === "yes"
              ? "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Yes {yesCents}¢
        </button>
        <button
          onClick={() => setSide("no")}
          className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            side === "no"
              ? "bg-red-100 text-red-700/80 dark:bg-red-950/30 dark:text-red-400"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          No {noCents}¢
        </button>
      </div>

      {/* Limit price input */}
      {orderType === "limit" && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">Limit Price</span>
          <div className="flex items-center border rounded-full overflow-hidden">
            <button
              onClick={() => {
                const next = Math.max(0.01, (customPrice ?? marketPrice) - 0.01)
                setCustomPrice(next)
                setLimitPriceInput((next * 100).toFixed(1))
              }}
              className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              −
            </button>
            <div className="flex items-center px-1 py-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={limitPriceFocused ? limitPriceInput : (customPrice !== null ? (customPrice * 100).toFixed(1) : "")}
                onFocus={() => {
                  setLimitPriceFocused(true)
                  setLimitPriceInput(customPrice !== null ? (customPrice * 100).toFixed(1) : "")
                }}
                onChange={(e) => {
                  setLimitPriceInput(e.target.value)
                }}
                onBlur={() => {
                  setLimitPriceFocused(false)
                  const cents = parseFloat(limitPriceInput)
                  if (!isNaN(cents) && cents > 0) {
                    setCustomPrice(Math.min(0.99, Math.max(0.01, cents / 100)))
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur()
                  }
                }}
                placeholder={(marketPrice * 100).toFixed(1)}
                className="w-14 text-sm font-medium text-center bg-transparent outline-none"
              />
              <span className="text-sm text-muted-foreground">¢</span>
            </div>
            <button
              onClick={() => {
                const next = Math.min(0.99, (customPrice ?? marketPrice) + 0.01)
                setCustomPrice(next)
                setLimitPriceInput((next * 100).toFixed(1))
              }}
              className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">{amountInShares ? "Shares" : "Amount"}</span>
        <div className="flex items-center border rounded-full overflow-hidden">
          <button
            onClick={() => setAmount(Math.max(0, amount - 1))}
            className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            −
          </button>
          <div className="flex items-center px-1 py-1.5">
            {!amountInShares && <span className="text-sm text-muted-foreground">$</span>}
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className={`text-sm font-medium text-center bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${amountInShares ? 'w-16' : 'w-12'}`}
            />
          </div>
          <button
            onClick={() => setAmount(amount + 1)}
            className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {hasEoaFunds && (
        <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            You have <strong>${eoaBalanceNum.toFixed(2)}</strong> on your wallet. Transfer to your trading wallet to start trading.
          </p>
          <Button
            size="sm"
            className="mt-2 w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            disabled={isTransferring}
            onClick={handleTransferToSafe}
          >
            {isTransferring ? <Spinner className="size-3" /> : `Transfer $${eoaBalanceNum.toFixed(2)} to Trading Wallet`}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-sm text-muted-foreground">{balanceLabel}</span>
        <span className="text-sm font-medium">
          {balanceLoading ? <Spinner className="size-3" /> : balanceDisplay}
        </span>
      </div>
      <div className="flex gap-1.5 justify-end mt-2">
        {[10, 50, 100].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            disabled={isConnected && v > balanceNum}
            className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {v}
          </button>
        ))}
        <button
          onClick={() => setAmount(Math.floor(balanceNum * 50) / 100)}
          disabled={!isConnected || balanceNum <= 0}
          className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Half
        </button>
        <button
          onClick={() => setAmount(Math.floor(balanceNum * 100) / 100)}
          disabled={!isConnected || balanceNum <= 0}
          className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Max
        </button>
      </div>

      <Separator className="my-4" />

      {isBuy ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm">Total</span>
            <span className="text-sm font-medium">${total.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-muted-foreground underline decoration-dotted">
              {isLimitBuy ? "Shares" : "To Win"}
            </span>
            <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
              {isLimitBuy
                ? amount.toFixed(2)
                : `$${toWin.toFixed(2)}`}
            </span>
          </div>
          {orderType === "limit" && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground underline decoration-dotted">Price</span>
              <span className="text-sm font-medium">{(price * 100).toFixed(1)}¢</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm">Shares</span>
            <span className="text-sm font-medium">{amount}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-muted-foreground underline decoration-dotted">Est. Return</span>
            <span className="text-sm font-medium text-teal-600 dark:text-teal-400">${(amount * price).toFixed(2)}</span>
          </div>
        </>
      )}

      {insufficientBalance && (
        <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {isBuy
            ? `Insufficient balance. You need $${(total - balanceNum).toFixed(2)} more.`
            : `Not enough shares. You have ${balanceNum.toFixed(2)} shares.`}
        </div>
      )}

      <Button
        className={`w-full h-12 text-sm font-semibold mt-4 border-0 transition-opacity ${
          side === "yes"
            ? "bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:hover:bg-teal-950/60"
            : "bg-red-100 text-red-700/80 hover:bg-red-200 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
        } ${amount <= 0 || insufficientBalance ? "opacity-40" : "opacity-100"}`}
        disabled={isLoading || insufficientBalance || (isConnected && amount <= 0)}
        onClick={handleTrade}
      >
        {isLoading ? (
          <Spinner className="size-4" />
        ) : !isConnected ? (
          "Connect Wallet to Trade"
        ) : insufficientBalance ? (
          "Insufficient Balance"
        ) : (
          <>
            {tab === "buy" ? "Buy" : "Sell"} {markets.length > 1 ? `${label} — ` : ""}{side === "yes" ? "Yes" : "No"}
            {orderType === "limit" ? ` @ ${(price * 100).toFixed(1)}¢` : "!"}
          </>
        )}
      </Button>
    </div>
  )
}
