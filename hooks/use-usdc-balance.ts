"use client"

import { useEffect, useState, useCallback } from "react"
import { createPublicClient, http, formatUnits } from "viem"
import { polygon } from "viem/chains"

const USDC_E_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const client = createPublicClient({
  chain: polygon,
  transport: http(),
})

export function useUsdcBalance(address: string | undefined) {
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  // Listen for global balance refresh events
  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener("poly:refresh", handler)
    return () => window.removeEventListener("poly:refresh", handler)
  }, [refetch])

  useEffect(() => {
    if (!address) {
      setBalance(null)
      return
    }

    let cancelled = false
    setLoading(true)

    client
      .readContract({
        address: USDC_E_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      })
      .then((raw) => {
        if (!cancelled) setBalance(formatUnits(raw, 6))
      })
      .catch(() => {
        if (!cancelled) setBalance(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [address, tick])

  return { balance, loading, refetch }
}
