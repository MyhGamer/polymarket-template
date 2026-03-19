"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import { HugeiconsIcon } from "@hugeicons/react"
import { Wallet01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useUsdcBalance } from "@/hooks/use-usdc-balance"
import { deriveSafeAddress } from "@/lib/polymarket/relayer"
import { useSession } from "@/hooks/use-session"
import { DepositModal } from "@/components/deposit-modal"
import { WithdrawModal } from "@/components/withdraw-modal"

export function PortfolioCard() {
  const { address } = useAccount()
  const safeAddr = address ? deriveSafeAddress(address) : undefined
  const { balance, loading } = useUsdcBalance(safeAddr)
  const { getRelayClient } = useSession()
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)

  const formattedBalance = balance
    ? `$${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "$0.00"

  return (
    <>
      <div className="rounded-2xl border overflow-hidden">
        <div className="p-6">
          <div className="text-sm text-muted-foreground">Portfolio Value</div>
          <div className="text-3xl font-semibold mt-1">
            {loading ? <Spinner className="size-6" /> : formattedBalance}
          </div>
          <div className="text-xs text-muted-foreground mt-1">USDC.e on Polygon</div>

          <div className="flex gap-3 mt-6">
            <Button
              className="flex-1 h-11"
              disabled={!address}
              onClick={() => setDepositModalOpen(true)}
            >
              <HugeiconsIcon icon={Wallet01Icon} className="size-4" />
              Deposit
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11"
              disabled={!address}
              onClick={() => setWithdrawModalOpen(true)}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
              Withdraw
            </Button>
          </div>
        </div>
      </div>

      <DepositModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
      />
      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        getRelayClient={getRelayClient}
      />
    </>
  )
}
