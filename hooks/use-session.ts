"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useAccount, useWalletClient, useSwitchChain } from "wagmi"
import { createWalletClient, custom } from "viem"
import { polygon } from "viem/chains"
import { toast } from "sonner"
import { ClobClient } from "@polymarket/clob-client"
import {
  createTradingClient,
  getOrCreateApiCredentials,
  type ApiCredentials,
} from "@/lib/polymarket/trading"
import {
  clearSession,
} from "@/lib/polymarket/session"
import {
  createRelayClient,
  deriveSafeAddress,
  isSafeDeployed,
  deploySafeWallet,
  checkAllApprovals,
  setAllTokenApprovals,
} from "@/lib/polymarket/relayer"
import { walletClientToSigner } from "@/lib/wagmi-ethers-adapter"

// Dev-only logging - disabled in production
const isDev = process.env.NODE_ENV !== "production"
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

const STORAGE_KEYS = {
  setup: (addr: string) => `poly_setup_${addr.toLowerCase()}`,
  creds: (addr: string) => `poly_creds_${addr.toLowerCase()}`,
}

type SetupState = {
  isDeployed: boolean
  isApproved: boolean
  l2Ready: boolean
}

type SessionState = {
  isReady: boolean
  isInitializing: boolean
  safeAddress: string | null
  isDeployed: boolean
  approvalsSet: boolean
  l2Ready: boolean
  error: string | null
  relayClientReady: boolean
  walletClientReady: boolean
  /** Incremented on every wallet switch */
  sessionVersion: number
}

const INITIAL_STATE: SessionState = {
  isReady: false,
  isInitializing: false,
  safeAddress: null,
  isDeployed: false,
  approvalsSet: false,
  l2Ready: false,
  error: null,
  relayClientReady: false,
  walletClientReady: false,
  sessionVersion: 0,
}

// Fallback: create walletClient directly from window.ethereum
// wagmi's useWalletClient() can fail to return data during SSR reconnect
function createFallbackWalletClient(addr: `0x${string}`) {
  const ethereum = (window as any).ethereum
  if (!ethereum) return null
  try {
    return createWalletClient({
      account: addr,
      chain: polygon,
      transport: custom(ethereum),
    })
  } catch (err) {
    devError("[Fallback] Failed to create wallet client:", err)
    return null
  }
}

export function useSession() {
  const { address, isConnected } = useAccount()
  const { data: wagmiWalletClient, refetch: refetchWalletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()

  const [state, setState] = useState<SessionState>(INITIAL_STATE)

  const clientRef = useRef<ClobClient | null>(null)
  const relayClientRef = useRef<ReturnType<typeof createRelayClient> | null>(null)
  const lastAddressRef = useRef<string | null>(null)
  const sessionVersionRef = useRef(0)
  const checkingRef = useRef(false)

  // Use wagmi walletClient if available, otherwise fallback to direct provider.
  // Memoize fallback so it doesn't recreate on every render.
  const fallbackRef = useRef<{ addr: string; client: ReturnType<typeof createFallbackWalletClient> } | null>(null)

  const walletClient = (() => {
    if (wagmiWalletClient) return wagmiWalletClient
    if (!address) return null
    // Reuse cached fallback if same address
    if (fallbackRef.current?.addr === address.toLowerCase()) return fallbackRef.current.client
    const fb = createFallbackWalletClient(address as `0x${string}`)
    if (fb) {
      fallbackRef.current = { addr: address.toLowerCase(), client: fb }
      devLog("[Session] Created fallback walletClient for", address)
    }
    return fb
  })()

  // ── Hard reset (wallet switch) ──
  const hardReset = useCallback(() => {
    devLog("[Session] Hard reset")
    clientRef.current = null
    relayClientRef.current = null
    fallbackRef.current = null
    checkingRef.current = false
    sessionVersionRef.current += 1
    setState(() => ({
      ...INITIAL_STATE,
      sessionVersion: sessionVersionRef.current,
    }))
  }, [])

  // ── Detect address changes ──
  useEffect(() => {
    if (!address) {
      if (lastAddressRef.current) {
        lastAddressRef.current = null
        hardReset()
      }
      return
    }
    if (address.toLowerCase() !== lastAddressRef.current?.toLowerCase()) {
      const prev = lastAddressRef.current
      lastAddressRef.current = address.toLowerCase()
      if (prev) {
        devLog("[Session] Wallet switched:", prev, "->", address)
        hardReset()
      }
      refetchWalletClient()
    }
  }, [address, hardReset, refetchWalletClient])

  // ── Provider-level account change listener ──
  useEffect(() => {
    const ethereum = (window as any).ethereum
    if (!ethereum) return
    const handler = (accounts: string[]) => {
      devLog("[Session] accountsChanged:", accounts)
      if (accounts.length === 0) {
        lastAddressRef.current = null
        hardReset()
      }
    }
    ethereum.on("accountsChanged", handler)
    return () => ethereum.removeListener("accountsChanged", handler)
  }, [hardReset])

  // ── Track walletClient ready state ──
  useEffect(() => {
    const ready = !!walletClient
    setState((s) => (s.walletClientReady === ready ? s : { ...s, walletClientReady: ready }))
    if (ready) {
      devLog("[Session] walletClient ready (source:", wagmiWalletClient ? "wagmi" : "fallback", ")")
    }
  }, [walletClient, wagmiWalletClient])

  // ── Init relay client when walletClient is ready ──
  useEffect(() => {
    if (!address || !walletClient?.account || !walletClient?.chain) return
    const version = sessionVersionRef.current
    try {
      const rc = createRelayClient(walletClient)
      relayClientRef.current = rc
      if (sessionVersionRef.current === version) {
        setState((s) => ({ ...s, relayClientReady: true }))
      }
      devLog("[Relay] Initialized")
    } catch (err: any) {
      devError("[Relay] Init failed:", err?.message)
    }
  }, [walletClient, address])

  // ══════════════════════════════════════════════════════════════════
  // CORE: Background check on connect/switch — NO walletClient needed
  // Uses public RPC to check safe deployed + approvals.
  // Then checks localStorage for cached L2 creds.
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!address || !isConnected) return

    const safeAddress = deriveSafeAddress(address)
    if (!safeAddress) return

    const version = sessionVersionRef.current
    const isWalletSwitch = version > 0

    setState((s) => ({ ...s, safeAddress }))

    // Don't run duplicate checks
    if (checkingRef.current) return
    checkingRef.current = true

    const runChecks = async () => {
      devLog("[Check] Starting background checks for", address, "safe:", safeAddress, "isSwitch:", isWalletSwitch)

      // 1. Check localStorage first (instant)
      let cachedDeployed = false
      let cachedApproved = false
      let cachedL2Ready = false
      let cachedCreds: ApiCredentials | null = null

      try {
        const setupRaw = localStorage.getItem(STORAGE_KEYS.setup(address))
        const credsRaw = localStorage.getItem(STORAGE_KEYS.creds(address))
        if (setupRaw) {
          const setup = JSON.parse(setupRaw) as SetupState
          cachedDeployed = !!setup.isDeployed
          cachedApproved = !!setup.isApproved
          if (!isWalletSwitch && setup.l2Ready && credsRaw) {
            cachedCreds = JSON.parse(credsRaw) as ApiCredentials
            cachedL2Ready = true
          }
        }
      } catch {}

      // Apply cached state immediately
      if (sessionVersionRef.current !== version) { checkingRef.current = false; return }
      setState((s) => ({
        ...s,
        isDeployed: cachedDeployed,
        approvalsSet: cachedApproved,
        l2Ready: cachedL2Ready,
      }))

      devLog("[Check] Cached state:", { cachedDeployed, cachedApproved, cachedL2Ready })

      // 2. Verify on-chain via public RPC (NO walletClient needed)
      try {
        const deployed = await isSafeDeployed(null as any, safeAddress)
        if (sessionVersionRef.current !== version) { checkingRef.current = false; return }
        devLog("[Check] On-chain deployed:", deployed)

        if (deployed) {
          setState((s) => ({ ...s, isDeployed: true }))

          const approved = await checkAllApprovals(safeAddress)
          if (sessionVersionRef.current !== version) { checkingRef.current = false; return }
          devLog("[Check] On-chain approved:", approved)

          if (approved) {
            setState((s) => ({ ...s, approvalsSet: true }))

            // Update localStorage
            const credsRaw = localStorage.getItem(STORAGE_KEYS.creds(address))
            const setup: SetupState = { isDeployed: true, isApproved: true, l2Ready: !!credsRaw }
            localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify(setup))
          }
        } else if (!cachedDeployed) {
          // Confirmed not deployed
          setState((s) => ({ ...s, isDeployed: false, approvalsSet: false }))
        }
      } catch (err) {
        devError("[Check] On-chain check failed:", err)
        // Keep cached state on error
      }

      // 3. If we have cached L2 creds (page load only), init CLOB client
      if (cachedL2Ready && cachedCreds && walletClient) {
        try {
          const signer = walletClientToSigner(walletClient)
          const client = createTradingClient(signer, cachedCreds, safeAddress)
          clientRef.current = client
          if (sessionVersionRef.current === version) {
            setState((s) => ({ ...s, isReady: true }))
            devLog("[Check] CLOB client restored from cache")
          }
        } catch (err) {
          devError("[Check] CLOB restore failed:", err)
          if (sessionVersionRef.current === version) {
            setState((s) => ({ ...s, l2Ready: false }))
          }
        }
      }

      checkingRef.current = false
    }

    runChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected])

  // ── When walletClient appears and we have pending l2Ready, init CLOB ──
  useEffect(() => {
    if (!walletClient || !address || !state.safeAddress) return
    if (!state.l2Ready || clientRef.current) return

    try {
      const credsRaw = localStorage.getItem(STORAGE_KEYS.creds(address))
      if (!credsRaw) return
      const creds = JSON.parse(credsRaw) as ApiCredentials
      const signer = walletClientToSigner(walletClient)
      const client = createTradingClient(signer, creds, state.safeAddress)
      clientRef.current = client
      setState((s) => ({ ...s, isReady: true }))
      devLog("[CLOB] Client initialized (walletClient appeared)")
    } catch (err) {
      devError("[CLOB] Init failed:", err)
      setState((s) => ({ ...s, l2Ready: false }))
    }
  }, [walletClient, address, state.safeAddress, state.l2Ready])

  // ══════════════════════════════════════════════════════════════════
  // SERVER AUTH — sign message to get HttpOnly session cookie
  // Must be called before any relayer/CLOB authenticated operations
  // ══════════════════════════════════════════════════════════════════

  const authenticateWithServer = useCallback(async (): Promise<boolean> => {
    if (!walletClient?.account || !address) return false

    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Sign in to Polymarket Trading\n\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`

      const signature = await walletClient.signMessage({
        message,
        account: walletClient.account,
      })

      const resp = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, timestamp }),
      })

      if (!resp.ok) {
        devError("[Auth] Server authentication failed:", resp.status)
        return false
      }

      devLog("[Auth] Server session established")
      return true
    } catch (err: any) {
      const msg = err?.message ?? ""
      const code = err?.code
      if (code === 4001 || msg.includes("rejected") || msg.includes("denied")) {
        devLog("[Auth] User rejected server auth signature")
      } else {
        devError("[Auth] Server auth failed:", msg)
      }
      return false
    }
  }, [walletClient, address])

  // ══════════════════════════════════════════════════════════════════
  // ACTIONS — each one does exactly one thing, requires walletClient
  // ══════════════════════════════════════════════════════════════════

  const handleDeploySafe = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !address) {
      setState((s) => ({ ...s, error: "Wallet not ready" }))
      return false
    }
    if (!relayClientRef.current) {
      setState((s) => ({ ...s, error: "Relay client not ready. Please wait..." }))
      return false
    }

    setState((s) => ({ ...s, isInitializing: true, error: null }))
    toast.loading("Deploying Safe wallet...", { id: "session-deploy" })

    try {
      await switchChainAsync({ chainId: polygon.id })
      await deploySafeWallet(relayClientRef.current)

      toast.success("Safe wallet deployed!", { id: "session-deploy" })
      setState((s) => ({ ...s, isDeployed: true, isInitializing: false }))
      localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify({
        isDeployed: true, isApproved: false, l2Ready: false,
      }))
      return true
    } catch (err: any) {
      if (err?.message?.includes("already deployed")) {
        setState((s) => ({ ...s, isDeployed: true, isInitializing: false }))
        localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify({
          isDeployed: true, isApproved: false, l2Ready: !!localStorage.getItem(STORAGE_KEYS.creds(address)),
        }))
        toast.success("Safe wallet already deployed!", { id: "session-deploy" })
        return true
      }
      const message = err?.message || "Failed to deploy Safe"
      toast.error(message, { id: "session-deploy" })
      setState((s) => ({ ...s, isInitializing: false, error: message }))
      return false
    }
  }, [walletClient, address, switchChainAsync])

  const handleSetApprovals = useCallback(async (): Promise<boolean> => {
    const safeAddress = state.safeAddress || (address ? deriveSafeAddress(address) : null)
    if (!walletClient || !address || !safeAddress) {
      setState((s) => ({ ...s, error: "Not ready" }))
      return false
    }
    if (!relayClientRef.current) {
      setState((s) => ({ ...s, error: "Relay client not ready" }))
      return false
    }

    setState((s) => ({ ...s, isInitializing: true, error: null }))

    try {
      // Check on-chain first
      const alreadyApproved = await checkAllApprovals(safeAddress)
      if (alreadyApproved) {
        toast.success("Token approvals already set!", { id: "session-approvals" })
        setState((s) => ({ ...s, approvalsSet: true, isInitializing: false }))
        localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify({
          isDeployed: true, isApproved: true, l2Ready: !!localStorage.getItem(STORAGE_KEYS.creds(address)),
        }))
        return true
      }

      toast.loading("Setting token approvals...", { id: "session-approvals" })
      await switchChainAsync({ chainId: polygon.id })
      await setAllTokenApprovals(relayClientRef.current)

      toast.success("Token approvals set!", { id: "session-approvals" })
      setState((s) => ({ ...s, approvalsSet: true, isInitializing: false }))
      localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify({
        isDeployed: true, isApproved: true, l2Ready: !!localStorage.getItem(STORAGE_KEYS.creds(address)),
      }))
      return true
    } catch (err: any) {
      const message = err?.message || "Failed to set approvals"
      toast.error(message, { id: "session-approvals" })
      setState((s) => ({ ...s, isInitializing: false, error: message }))
      return false
    }
  }, [walletClient, address, state.safeAddress, switchChainAsync])

  const handleCreateL2Keys = useCallback(async (): Promise<boolean> => {
    const safeAddress = state.safeAddress || (address ? deriveSafeAddress(address) : null)
    if (!walletClient?.account || !address || !safeAddress) {
      setState((s) => ({ ...s, error: "Wallet not ready" }))
      return false
    }

    setState((s) => ({ ...s, isInitializing: true, error: null }))
    toast.loading("Creating API credentials - please sign in your wallet...", { id: "session-keys" })

    try {
      await switchChainAsync({ chainId: polygon.id })
      const signer = walletClientToSigner(walletClient)
      const creds = await getOrCreateApiCredentials(signer)

      if (creds?.key && creds?.secret) {
        localStorage.setItem(STORAGE_KEYS.creds(address), JSON.stringify(creds))
        clientRef.current = createTradingClient(signer, creds, safeAddress)

        toast.success("API credentials created!", { id: "session-keys" })
        setState((s) => ({ ...s, l2Ready: true, isReady: true, isInitializing: false }))
        localStorage.setItem(STORAGE_KEYS.setup(address), JSON.stringify({
          isDeployed: true, isApproved: true, l2Ready: true,
        }))
        return true
      }
      return false
    } catch (err: any) {
      const message = err?.message || "Failed to create API credentials"
      toast.error(message, { id: "session-keys" })
      setState((s) => ({ ...s, isInitializing: false, error: message }))
      return false
    }
  }, [walletClient, address, state.safeAddress, switchChainAsync])

  // ── Full setup (only for NEW wallets — no safe deployed) ──
  const runFullSetup = useCallback(async (): Promise<boolean> => {
    devLog("[Setup] runFullSetup called. State:", {
      isDeployed: state.isDeployed, approvalsSet: state.approvalsSet, l2Ready: state.l2Ready,
    })

    // Step 0: Authenticate with server (sets HttpOnly session cookie)
    toast.loading("Authenticating - please sign in your wallet...", { id: "session-auth" })
    const authOk = await authenticateWithServer()
    if (!authOk) {
      toast.error("Server authentication failed", { id: "session-auth" })
      return false
    }
    toast.success("Authenticated!", { id: "session-auth" })

    // Step 1
    if (!state.isDeployed) {
      const ok = await handleDeploySafe()
      if (!ok) return false
    }
    // Step 2
    if (!state.approvalsSet) {
      const ok = await handleSetApprovals()
      if (!ok) return false
    }
    // Step 3
    if (!state.l2Ready) {
      const ok = await handleCreateL2Keys()
      if (!ok) return false
    }

    setState((s) => ({ ...s, isReady: true }))
    return true
  }, [state.isDeployed, state.approvalsSet, state.l2Ready, authenticateWithServer, handleDeploySafe, handleSetApprovals, handleCreateL2Keys])

  const getClient = useCallback(() => clientRef.current, [])
  const getRelayClient = useCallback(() => relayClientRef.current, [])

  const resetSession = useCallback(() => {
    if (address) {
      localStorage.removeItem(STORAGE_KEYS.setup(address))
      localStorage.removeItem(STORAGE_KEYS.creds(address))
      clearSession(address)
    }
    // Clear server session cookie
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {})
    hardReset()
  }, [address, hardReset])

  const hasStoredCredentials = useCallback(() => {
    if (!address) return false
    return !!localStorage.getItem(STORAGE_KEYS.creds(address))
  }, [address])

  return {
    ...state,
    runFullSetup,
    handleDeploySafe,
    handleSetApprovals,
    handleCreateL2Keys,
    getClient,
    getRelayClient,
    resetSession,
    hasStoredCredentials,
    isAuthenticated: isConnected,
    walletAddress: address ?? null,
  }
}
