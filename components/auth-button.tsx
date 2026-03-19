"use client"

import Link from "next/link"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { HugeiconsIcon } from "@hugeicons/react"
import { Login01Icon, WalletIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Avatar from "boring-avatars"
import { useUsdcBalance } from "@/hooks/use-usdc-balance"
import { usePortfolioValue } from "@/hooks/use-portfolio-value"
import { deriveSafeAddress } from "@/lib/polymarket/relayer"

export function AuthButton() {
  const { address, isConnected, status } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  const safeAddress = address ? deriveSafeAddress(address) : undefined
  const { balance, loading: balanceLoading } = useUsdcBalance(safeAddress)
  const { portfolioValue, loading: portfolioLoading } = usePortfolioValue(safeAddress)

  if (status === "connecting" || status === "reconnecting") {
    return (
      <Button size="sm" disabled>
        <Spinner />
      </Button>
    )
  }

  if (isConnected && address) {
    const displayName = `${address.slice(0, 6)}...${address.slice(-4)}`
    const formattedBalance = balance
      ? `$${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "$0.00"
    const formattedPortfolioValue = portfolioValue
      ? `$${Number(portfolioValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "$0.00"

    return (
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end gap-0.5 text-sm">
          <span className="text-xs text-muted-foreground">Cash</span>
          <span className="font-medium">
            {balanceLoading ? <Spinner className="size-3" /> : formattedBalance}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-sm">
          <span className="text-xs text-muted-foreground">Portfolio</span>
          <span className="font-medium">
            {portfolioLoading ? <Spinner className="size-3" /> : formattedPortfolioValue}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <div className="size-7 shrink-0 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer">
              <Avatar name={address} variant="beam" size={28} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/portfolio" className="flex items-center gap-2 cursor-pointer">
                <HugeiconsIcon icon={WalletIcon} className="size-4" />
                Portfolio
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => disconnect()}
              className="flex items-center gap-2 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
            >
              <HugeiconsIcon icon={Login01Icon} className="size-4 rotate-180" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <Button size="sm" onClick={() => connect({ connector: injected() })}>
      <HugeiconsIcon icon={Login01Icon} className="size-4" />
      Connect Wallet
    </Button>
  )
}