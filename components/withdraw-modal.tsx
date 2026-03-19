"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { parseUnits } from "viem"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Wallet01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  deriveSafeAddress,
  transferFromSafe,
} from "@/lib/polymarket/relayer"
import type { RelayClient } from "@polymarket/builder-relayer-client"
import {
  createWithdrawalAddress,
  getSupportedAssets,
  getTransactionStatus,
  type SupportedAsset,
  type Transaction,
} from "@/lib/polymarket/bridge"
import { useUsdcBalance } from "@/hooks/use-usdc-balance"
import { TransactionList } from "@/components/deposit-modal"

interface WithdrawModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  getRelayClient: () => RelayClient | null
}

function DirectWithdrawTab({
  safeAddress,
  getRelayClient,
}: {
  safeAddress: string
  getRelayClient: () => RelayClient | null
}) {
  const { address: eoaAddress } = useAccount()
  const { balance } = useUsdcBalance(safeAddress)
  const [amount, setAmount] = useState("")
  const [recipientAddr, setRecipientAddr] = useState(eoaAddress || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleWithdraw = async () => {
    if (!amount || !recipientAddr) return

    const relayClient = getRelayClient()
    if (!relayClient) {
      setError("Relay client not ready. Make sure your session is set up.")
      return
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Enter a valid amount")
      return
    }

    if (balance && numAmount > parseFloat(balance)) {
      setError("Insufficient balance")
      return
    }

    setLoading(true)
    setError("")
    setSuccess(false)

    try {
      const amountBaseUnits = parseUnits(amount, 6)
      await transferFromSafe(relayClient, recipientAddr, amountBaseUnits)
      setSuccess(true)
      setAmount("")
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Withdrawal failed"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="py-4">
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={Wallet01Icon} className="size-5 text-primary" />
            </div>
            <div>
              <div className="font-medium">USDC.e</div>
              <div className="text-xs text-muted-foreground">Polygon</div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground mb-1">
            Withdraw USDC.e from your Safe wallet to any Polygon address.
          </div>
          {balance && (
            <div className="text-xs text-muted-foreground">
              Available: <span className="font-medium text-foreground">${parseFloat(balance).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Amount (USDC.e)</label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {balance && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setAmount(balance)}
              >
                Max
              </Button>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Recipient Address</label>
          <Input
            placeholder="0x..."
            value={recipientAddr}
            onChange={(e) => setRecipientAddr(e.target.value)}
          />
          <div className="text-xs text-muted-foreground mt-1">
            Defaults to your connected wallet.
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleWithdraw}
          disabled={loading || !amount || !recipientAddr}
        >
          {loading ? (
            <><Spinner className="size-4 mr-2" />Processing Withdrawal...</>
          ) : (
            <><HugeiconsIcon icon={ArrowRight01Icon} className="size-4 mr-2" />Withdraw</>
          )}
        </Button>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {success && (
          <div className="rounded-lg border bg-green-500/10 p-4">
            <div className="text-sm font-medium text-green-700 dark:text-green-400">
              Withdrawal successful!
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              USDC.e has been sent to {recipientAddr.slice(0, 10)}...{recipientAddr.slice(-6)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BridgeWithdrawTab({
  safeAddress,
  getRelayClient,
}: {
  safeAddress: string
  getRelayClient: () => RelayClient | null
}) {
  const { address: eoaAddress } = useAccount()
  const { balance } = useUsdcBalance(safeAddress)
  const [supportedAssets, setSupportedAssets] = useState<SupportedAsset[]>([])
  const [selectedChainId, setSelectedChainId] = useState<string>("")
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>("")
  const [recipientAddr, setRecipientAddr] = useState<string>(eoaAddress || "")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [error, setError] = useState<string>("")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pollingAddress, setPollingAddress] = useState<string>("")
  const [step, setStep] = useState<"form" | "sending">("form")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getSupportedAssets()
      .then(setSupportedAssets)
      .catch(() => setSupportedAssets([]))
      .finally(() => setLoadingAssets(false))
  }, [])

  const chains = supportedAssets.reduce<{ chainId: string; chainName: string }[]>((acc, a) => {
    if (!acc.some((c) => c.chainId === a.chainId)) {
      acc.push({ chainId: a.chainId, chainName: a.chainName })
    }
    return acc
  }, [])

  const tokensForChain = supportedAssets.filter((a) => a.chainId === selectedChainId)

  useEffect(() => {
    if (!pollingAddress) return
    let cancelled = false
    const poll = async () => {
      try {
        const result = await getTransactionStatus(pollingAddress)
        if (!cancelled) setTransactions(result.transactions || [])
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [pollingAddress])

  const handleWithdrawViaBridge = async () => {
    if (!selectedChainId || !selectedTokenAddress || !recipientAddr || !amount) return

    const relayClient = getRelayClient()
    if (!relayClient) {
      setError("Relay client not ready. Make sure your session is set up.")
      return
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Enter a valid amount")
      return
    }

    if (balance && numAmount > parseFloat(balance)) {
      setError("Insufficient balance")
      return
    }

    setLoading(true)
    setError("")
    setTransactions([])
    setStep("form")
    setSuccess(false)

    try {
      // Step 1: Create bridge withdrawal address
      const addresses = await createWithdrawalAddress(
        safeAddress,
        selectedChainId,
        selectedTokenAddress,
        recipientAddr
      )

      // Step 2: Send USDC.e from Safe to the bridge address
      setStep("sending")
      const amountBaseUnits = parseUnits(amount, 6)
      await transferFromSafe(relayClient, addresses.evm, amountBaseUnits)

      // Step 3: Mark success and start polling for bridge status
      setSuccess(true)
      setPollingAddress(addresses.evm)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Bridge withdrawal failed"
      setError(msg)
    } finally {
      setLoading(false)
      setStep("form")
    }
  }

  return (
    <div className="py-4">
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Bridge USDC.e from Polymarket to another chain and wallet.
        </div>

        {balance && (
          <div className="text-xs text-muted-foreground">
            Available: <span className="font-medium text-foreground">${parseFloat(balance).toFixed(2)}</span>
          </div>
        )}

        {loadingAssets ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium mb-2 block">Destination Chain</label>
              <Select
                value={selectedChainId}
                onValueChange={(v) => {
                  setSelectedChainId(v)
                  setSelectedTokenAddress("")
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose destination chain" />
                </SelectTrigger>
                <SelectContent>
                  {chains.map((chain) => (
                    <SelectItem key={chain.chainId} value={chain.chainId}>
                      {chain.chainName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedChainId && (
              <div>
                <label className="text-sm font-medium mb-2 block">Destination Token</label>
                <Select value={selectedTokenAddress} onValueChange={setSelectedTokenAddress}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose token" />
                  </SelectTrigger>
                  <SelectContent>
                    {tokensForChain.length > 0 ? (
                      tokensForChain.map((asset) => (
                        <SelectItem key={asset.token.address} value={asset.token.address}>
                          {asset.token.symbol} — {asset.token.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48">
                        USDC
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Amount (USDC.e)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {balance && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setAmount(balance)}
                  >
                    Max
                  </Button>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Recipient Address</label>
              <Input
                placeholder="0x..."
                value={recipientAddr}
                onChange={(e) => setRecipientAddr(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Defaults to your connected wallet.
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleWithdrawViaBridge}
              disabled={loading || !selectedChainId || !selectedTokenAddress || !recipientAddr || !amount}
            >
              {loading ? (
                <><Spinner className="size-4 mr-2" />{step === "sending" ? "Sending to Bridge..." : "Creating Withdrawal..."}</>
              ) : (
                <><HugeiconsIcon icon={ArrowRight01Icon} className="size-4 mr-2" />Withdraw via Bridge</>
              )}
            </Button>

          </>
        )}

        {pollingAddress && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-primary"
            onClick={() => {
              getTransactionStatus(pollingAddress).then(r => setTransactions(r.transactions || [])).catch(() => {})
            }}
          >
            Check withdrawal status
          </Button>
        )}

        {error && <div className="text-sm text-destructive mt-2">{error}</div>}

        {success && (
          <div className="rounded-lg border bg-green-500/10 p-4">
            <div className="text-sm font-medium text-green-700 dark:text-green-400">
              Bridge withdrawal submitted!
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {amount} USDC.e sent to bridge. Tokens will arrive on the destination chain shortly.
            </div>
          </div>
        )}

        <TransactionList transactions={transactions} />
      </div>
    </div>
  )
}

export function WithdrawModal({ open, onOpenChange, getRelayClient }: WithdrawModalProps) {
  const { address } = useAccount()
  const safeAddress = address ? deriveSafeAddress(address) : undefined

  if (!safeAddress) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Withdraw</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="direct" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">Direct</TabsTrigger>
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
          </TabsList>

          <TabsContent value="direct">
            <DirectWithdrawTab safeAddress={safeAddress} getRelayClient={getRelayClient} />
          </TabsContent>

          <TabsContent value="bridge">
            <BridgeWithdrawTab safeAddress={safeAddress} getRelayClient={getRelayClient} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
