"use client"

import { useEffect, useRef } from "react"
import { useAccount } from "wagmi"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Loading03Icon,
  Wallet01Icon,
  Key01Icon,
  CheckmarkBadgeIcon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSession } from "@/hooks/use-session"

const devLog = (...args: unknown[]) => { console.log(...args) }

const ALL_STEPS = [
  { id: "deploy", label: "Deploy Safe Wallet", icon: Wallet01Icon },
  { id: "approve", label: "Set Token Approvals", icon: CheckmarkBadgeIcon },
  { id: "keys", label: "Create API Keys", icon: Key01Icon },
]

export function SetupProgress() {
  const { address, isConnected } = useAccount()
  const {
    isReady,
    isInitializing,
    isDeployed,
    approvalsSet,
    l2Ready,
    walletClientReady,
    relayClientReady,
    sessionVersion,
    runFullSetup,
    handleSetApprovals,
    handleCreateL2Keys,
  } = useSession()

  const hasRun = useRef(false)
  const lastVersion = useRef(sessionVersion)

  // Reset on wallet switch
  useEffect(() => {
    if (sessionVersion !== lastVersion.current) {
      lastVersion.current = sessionVersion
      hasRun.current = false
    }
  }, [sessionVersion])

  useEffect(() => {
    if (!isConnected) hasRun.current = false
  }, [isConnected])

  // ── Decide what action to take based on current state ──
  useEffect(() => {
    if (!isConnected || !address || isReady || hasRun.current) return
    if (isDeployed && approvalsSet && l2Ready) return

    // Need walletClient + relayClient for any signing action
    if (!walletClientReady || !relayClientReady) {
      devLog("[SetupProgress] Waiting for walletClient/relayClient...", { walletClientReady, relayClientReady })
      return
    }

    // Determine what's needed and run the appropriate action
    const timer = setTimeout(async () => {
      if (hasRun.current) return
      hasRun.current = true

      devLog("[SetupProgress] Running action. State:", { isDeployed, approvalsSet, l2Ready })

      let ok = true

      if (!isDeployed) {
        // New wallet — need full setup
        devLog("[SetupProgress] New wallet, running full setup")
        ok = await runFullSetup()
      } else if (!approvalsSet) {
        // Safe deployed but no approvals
        devLog("[SetupProgress] Setting approvals")
        ok = await handleSetApprovals()
        if (ok) {
          // Then create L2 keys
          ok = await handleCreateL2Keys()
        }
      } else if (!l2Ready) {
        // Safe deployed + approved, just need L2 keys
        devLog("[SetupProgress] Creating L2 keys only")
        ok = await handleCreateL2Keys()
      }

      if (!ok) hasRun.current = false
    }, 500)

    return () => clearTimeout(timer)
  }, [isConnected, address, isReady, isDeployed, approvalsSet, l2Ready,
      walletClientReady, relayClientReady, sessionVersion,
      runFullSetup, handleSetApprovals, handleCreateL2Keys])

  // ── Render ──

  if (!isConnected || !address || isReady) return null
  if (isDeployed && approvalsSet && l2Ready) return null

  // Nothing to show until background check has determined what's needed
  // (isDeployed/approvalsSet will be set by the background check)
  // But if we know we need something, show it

  const needsSetup = !isDeployed || !approvalsSet || !l2Ready
  if (!needsSetup) return null

  // Determine visible steps
  const isReturningWallet = isDeployed && approvalsSet && !l2Ready
  const needsApprovalsOnly = isDeployed && !approvalsSet

  let steps: typeof ALL_STEPS
  if (isReturningWallet) {
    steps = [ALL_STEPS[2]] // just keys
  } else if (needsApprovalsOnly) {
    steps = [ALL_STEPS[1], ALL_STEPS[2]] // approvals + keys
  } else if (!isDeployed) {
    steps = ALL_STEPS // full setup
  } else {
    steps = ALL_STEPS
  }

  // Current step index (relative to visible steps)
  let currentStep: number
  if (isReturningWallet) {
    currentStep = 0
  } else if (needsApprovalsOnly) {
    currentStep = approvalsSet ? 1 : 0
  } else {
    currentStep = !isDeployed ? 0 : !approvalsSet ? 1 : !l2Ready ? 2 : 3
  }

  const title = isReturningWallet ? "Sign In to Trade" : "Setting Up Trading Account"
  const description = isReturningWallet
    ? "Your wallet is set up. Please sign a message to create your API keys."
    : "We're setting up your trading account. This only happens once."

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Wallet01Icon} className="size-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-6">{description}</p>

          <div className="space-y-4">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep
              const isCurrent = index === currentStep
              const isPending = index > currentStep

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCurrent ? "bg-primary/10 border border-primary/20" : ""
                  } ${isCompleted ? "opacity-60" : ""}`}
                >
                  <div
                    className={`flex items-center justify-center size-8 rounded-full shrink-0 ${
                      isCompleted
                        ? "bg-green-500/20 text-green-600 dark:text-green-400"
                        : isCurrent
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5" />
                    ) : isCurrent ? (
                      <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={step.icon} className="size-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${isPending ? "text-muted-foreground" : ""}`}>
                      {step.label}
                    </div>
                    {isCurrent && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {step.id === "deploy" && "Creating your Safe smart contract wallet..."}
                        {step.id === "approve" && "Approving tokens for trading..."}
                        {step.id === "keys" && "Please sign in your wallet to generate credentials..."}
                      </div>
                    )}
                  </div>
                  {isCompleted && (
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Please confirm transactions in your wallet when prompted
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
