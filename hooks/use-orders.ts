"use client"

import { useState, useCallback, useEffect } from "react"
import { useAccount } from "wagmi"
import { toast } from "sonner"
import {
  getOpenOrders,
  cancelOrder,
  cancelAllOrders,
  type OpenOrder,
} from "@/lib/polymarket/trading"
import { useSession } from "./use-session"

type OrdersState = {
  orders: OpenOrder[]
  loading: boolean
  error: string | null
  cancelling: string | null
}

export function useOrders() {
  const { address, isConnected } = useAccount()
  const { isReady, runFullSetup, getClient, hasStoredCredentials, isDeployed, approvalsSet, l2Ready, relayClientReady, walletClientReady } = useSession()

  const [state, setState] = useState<OrdersState>({
    orders: [],
    loading: false,
    error: null,
    cancelling: null,
  })

  const fetchOrders = useCallback(async () => {
    if (!address) {
      setState((s) => ({ ...s, orders: [], loading: false }))
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      let client = getClient()
      if (!client) {
        const success = await runFullSetup()
        if (!success) {
          setState((s) => ({ ...s, orders: [], loading: false, error: "Failed to initialize" }))
          return
        }
        client = getClient()
      }
      if (!client) {
        setState((s) => ({ ...s, orders: [], loading: false, error: "Client not available" }))
        return
      }

      const orders = await getOpenOrders(client)
      console.log("[Orders] Fetched:", orders.length)
      setState((s) => ({ ...s, orders, loading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch orders"
      console.error("[Orders] Fetch error:", message)
      setState((s) => ({ ...s, loading: false, error: message }))
    }
  }, [address, getClient, runFullSetup])

  const cancelSingleOrder = useCallback(async (orderId: string) => {
    setState((s) => ({ ...s, cancelling: orderId, error: null }))

    try {
      let client = getClient()
      if (!client) {
        const success = await runFullSetup()
        if (!success) {
          toast.error("Failed to initialize")
          setState((s) => ({ ...s, cancelling: null }))
          return false
        }
        client = getClient()
      }
      if (!client) {
        toast.error("Client not available")
        setState((s) => ({ ...s, cancelling: null }))
        return false
      }

      const result = await cancelOrder(client, orderId)
      if (result.canceled.includes(orderId)) {
        toast.success("Order cancelled")
        setState((s) => ({
          ...s,
          cancelling: null,
          orders: s.orders.filter((o) => o.id !== orderId),
        }))
        return true
      } else {
        const reason = result.failed[orderId] || "Unknown error"
        toast.error(`Failed to cancel: ${reason}`)
        setState((s) => ({ ...s, cancelling: null }))
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel order"
      toast.error(message)
      setState((s) => ({ ...s, cancelling: null }))
      return false
    }
  }, [getClient, runFullSetup])

  const cancelAll = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      let client = getClient()
      if (!client) {
        const success = await runFullSetup()
        if (!success) {
          toast.error("Failed to initialize")
          setState((s) => ({ ...s, loading: false }))
          return false
        }
        client = getClient()
      }
      if (!client) {
        toast.error("Client not available")
        setState((s) => ({ ...s, loading: false }))
        return false
      }

      const result = await cancelAllOrders(client)
      if (result.canceled.length > 0) {
        toast.success(`Cancelled ${result.canceled.length} orders`)
        setState((s) => ({ ...s, orders: [], loading: false }))
        return true
      } else {
        toast.info("No orders to cancel")
        setState((s) => ({ ...s, loading: false }))
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel orders"
      toast.error(message)
      setState((s) => ({ ...s, loading: false }))
      return false
    }
  }, [getClient, runFullSetup])

  // Auto-fetch orders when session is ready
  useEffect(() => {
    if (address && isConnected && isReady && relayClientReady && walletClientReady) {
      fetchOrders()
    }
  }, [address, isConnected, isReady, relayClientReady, walletClientReady, fetchOrders])

  return {
    ...state,
    fetchOrders,
    cancelSingleOrder,
    cancelAll,
    hasStoredCredentials: hasStoredCredentials(),
    isSessionReady: isReady,
    needsSetup: !relayClientReady || !walletClientReady,
    needsDeploy: !isDeployed && relayClientReady && walletClientReady,
    needsApprovals: isDeployed && !approvalsSet,
    needsL2Keys: approvalsSet && !l2Ready,
    relayClientReady,
    walletClientReady,
  }
}
