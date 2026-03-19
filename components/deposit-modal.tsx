"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Wallet01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  CheckmarkCircle02Icon,
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
import { Spinner } from "@/components/ui/spinner"
import { deriveSafeAddress } from "@/lib/polymarket/relayer"
import {
  createDepositAddress,
  getSupportedAssets,
  type DepositAddresses,
  type SupportedAsset,
  type Transaction,
} from "@/lib/polymarket/bridge"

interface DepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function AddressDisplay({
  address,
  label,
}: {
  address: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm font-mono break-all">{address}</code>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copyAddress}
          className="shrink-0"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
            className="size-4"
          />
        </Button>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: Transaction["status"] }) {
  const styles: Record<string, string> = {
    DEPOSIT_DETECTED: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    PROCESSING: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    ORIGIN_TX_CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    SUBMITTED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    COMPLETED: "bg-green-500/10 text-green-700 dark:text-green-400",
    FAILED: "bg-red-500/10 text-red-700 dark:text-red-400",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || ""}`}>
      {status.replace(/_/g, " ")}
    </span>
  )
}

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) return null

  return (
    <div className="mt-4">
      <div className="text-sm font-medium mb-2">Transaction Status</div>
      <div className="space-y-2">
        {transactions.map((tx, i) => (
          <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={tx.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>{tx.fromAmountBaseUnit}</span>
            </div>
            {tx.txHash && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tx Hash</span>
                <code className="text-xs">{tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}</code>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DirectDepositTab({ safeAddress }: { safeAddress: string }) {
  return (
    <div className="py-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <HugeiconsIcon icon={Wallet01Icon} className="size-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">USDC.e</div>
            <div className="text-xs text-muted-foreground">Polygon</div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          Send USDC.e directly to your Safe wallet on Polygon.
        </div>
        <AddressDisplay address={safeAddress} label="Your Safe Wallet Address (Polygon)" />
      </div>
    </div>
  )
}

// Solana mainnet chain ID used by Polymarket bridge
const SOLANA_CHAIN_ID = "1151111081099710"
// Bitcoin doesn't have a standard numeric chain ID, but the bridge uses this
const BTC_CHAIN_IDS = ["btc", "bitcoin", "0"]

function getDepositAddressForChain(
  addresses: DepositAddresses,
  chainId: string,
): { address: string; label: string } | null {
  if (chainId === SOLANA_CHAIN_ID) {
    return addresses.svm ? { address: addresses.svm, label: "Solana Deposit Address" } : null
  }
  if (BTC_CHAIN_IDS.includes(chainId.toLowerCase())) {
    return addresses.btc ? { address: addresses.btc, label: "Bitcoin Deposit Address" } : null
  }
  return addresses.evm ? { address: addresses.evm, label: "EVM Deposit Address" } : null
}

function BridgeDepositTab({ safeAddress }: { safeAddress: string }) {
  const [supportedAssets, setSupportedAssets] = useState<SupportedAsset[]>([])
  const [selectedChainId, setSelectedChainId] = useState<string>("")
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>("")
  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [error, setError] = useState<string>("")

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
  const selectedAssetData = tokensForChain.find((a) => a.token.address === selectedTokenAddress)

  const handleCreateDepositAddress = async () => {
    setLoading(true)
    setError("")
    setDepositAddresses(null)
    try {
      const addresses = await createDepositAddress(safeAddress)
      setDepositAddresses(addresses)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deposit address.")
    } finally {
      setLoading(false)
    }
  }

  const relevantAddress = depositAddresses && selectedChainId
    ? getDepositAddressForChain(depositAddresses, selectedChainId)
    : null

  return (
    <div className="py-4">
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Bridge tokens from another chain. Funds arrive as USDC.e on Polygon.
        </div>

        {loadingAssets ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium mb-2 block">Source Chain</label>
              <Select
                value={selectedChainId}
                onValueChange={(v) => {
                  setSelectedChainId(v)
                  setSelectedTokenAddress("")
                  setDepositAddresses(null)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose source chain" />
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
                <label className="text-sm font-medium mb-2 block">Source Token</label>
                <Select value={selectedTokenAddress} onValueChange={setSelectedTokenAddress}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose token" />
                  </SelectTrigger>
                  <SelectContent>
                    {tokensForChain.map((asset) => (
                      <SelectItem key={asset.token.address} value={asset.token.address}>
                        {asset.token.symbol} — {asset.token.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedAssetData && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <div>Min deposit: ${selectedAssetData.minCheckoutUsd}</div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreateDepositAddress}
              disabled={loading || !selectedChainId || !selectedTokenAddress}
            >
              {loading ? (
                <><Spinner className="size-4 mr-2" />Creating Address...</>
              ) : (
                <><HugeiconsIcon icon={ArrowRight01Icon} className="size-4 mr-2" />Get Deposit Address</>
              )}
            </Button>
          </>
        )}

        {error && <div className="text-sm text-destructive mt-2">{error}</div>}

        {relevantAddress && (
          <div className="space-y-2">
            {depositAddresses?.note && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                {depositAddresses.note}
              </div>
            )}
            <AddressDisplay address={relevantAddress.address} label={relevantAddress.label} />
          </div>
        )}
      </div>
    </div>
  )
}

export function DepositModal({ open, onOpenChange }: DepositModalProps) {
  const { address } = useAccount()
  const safeAddress = address ? deriveSafeAddress(address) : undefined

  if (!safeAddress) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deposit</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="direct" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">Direct</TabsTrigger>
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
          </TabsList>

          <TabsContent value="direct">
            <DirectDepositTab safeAddress={safeAddress} />
          </TabsContent>

          <TabsContent value="bridge">
            <BridgeDepositTab safeAddress={safeAddress} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
