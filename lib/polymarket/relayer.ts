"use client"

import { encodeFunctionData, maxUint256, createPublicClient, http, fallback, erc20Abi } from "viem"

// Dev-only logging
const isDev = process.env.NODE_ENV !== "production"
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }
const devWarn = (...args: unknown[]) => { if (isDev) console.warn(...args) }
import type { WalletClient } from "viem"
import { polygon } from "viem/chains"
import { RelayClient, RelayerTransactionState, OperationType } from "@polymarket/builder-relayer-client"
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive.js"
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config/index.js"
import {
  CHAIN_ID,
  RELAYER_URL,
  USDC_ADDRESS,
  CTF_ADDRESS,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  NEG_RISK_ADAPTER,
  ERC20_ABI,
  ERC20_APPROVAL_ABI,
  POLYGON_RPCS,
} from "./constants"

const ERC1155_SET_APPROVAL_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

const ERC20_SPENDERS = [
  { address: CTF_ADDRESS, name: "CTF" },
  { address: NEG_RISK_ADAPTER, name: "NegRiskAdapter" },
  { address: CTF_EXCHANGE, name: "CTF Exchange" },
  { address: NEG_RISK_CTF_EXCHANGE, name: "NegRisk CTF Exchange" },
]

const ERC1155_OPERATORS = [
  { address: CTF_EXCHANGE, name: "CTF Exchange" },
  { address: NEG_RISK_CTF_EXCHANGE, name: "NegRisk CTF Exchange" },
  { address: NEG_RISK_ADAPTER, name: "NegRisk Adapter" },
]

// Builder auth is handled server-side via /api/relayer proxy
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRelayClient(signerOrWalletClient: any) {
  return new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    signerOrWalletClient,
  )
}

export function deriveSafeAddress(eoaAddress: string): string {
  const config = getContractConfig(CHAIN_ID)
  return deriveSafe(eoaAddress, config.SafeContracts.SafeFactory)
}

export async function isSafeDeployed(
  _relayClient: RelayClient,
  safeAddress: string,
): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: fallback(POLYGON_RPCS.map(url => http(url))),
    })
    const code = await publicClient.getCode({ address: safeAddress as `0x${string}` })
    const isDeployed = !!code && code !== "0x"
    devLog(`[Safe] Checking ${safeAddress}: ${isDeployed ? 'DEPLOYED' : 'NOT DEPLOYED'}`)
    return isDeployed
  } catch (err: any) {
    devWarn("[Safe] Error checking deployment:", err?.message || err)
    return false
  }
}

export async function checkAllApprovals(safeAddress: string): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: fallback(POLYGON_RPCS.map(url => http(url))),
    })

    // Check ERC20 approvals
    const erc20Approvals = await Promise.all(
      ERC20_SPENDERS.map(async ({ address }) => {
        const allowance = await publicClient.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_APPROVAL_ABI,
          functionName: "allowance",
          args: [safeAddress as `0x${string}`, address as `0x${string}`],
        }) as bigint
        return allowance >= BigInt("1000000000000") // 1M USDC
      })
    )

    // Check ERC1155 approvals
    const erc1155Approvals = await Promise.all(
      ERC1155_OPERATORS.map(async ({ address }) => {
        const isApproved = await publicClient.readContract({
          address: CTF_ADDRESS as `0x${string}`,
          abi: ERC1155_SET_APPROVAL_ABI,
          functionName: "isApprovedForAll",
          args: [safeAddress as `0x${string}`, address as `0x${string}`],
        }) as boolean
        return isApproved
      })
    )

    const allApproved =
      erc20Approvals.every((approved) => approved) &&
      erc1155Approvals.every((approved) => approved)

    devLog("[Approvals] USDC:", erc20Approvals, "CTF:", erc1155Approvals, "All:", allApproved)

    return allApproved
  } catch (err) {
    devError("[Approvals] Check failed:", err)
    return false
  }
}

export async function deploySafeWallet(
  relayClient: RelayClient,
): Promise<string> {
  const response = await relayClient.deploy()

  const result = await relayClient.pollUntilState(
    response.transactionID,
    [
      RelayerTransactionState.STATE_MINED,
      RelayerTransactionState.STATE_CONFIRMED,
      RelayerTransactionState.STATE_FAILED,
    ],
    "60",
    3000,
  )

  if (!result) {
    throw new Error("Safe deployment failed — no result from relayer")
  }

  return result.proxyAddress ?? ""
}

export async function setAllTokenApprovals(
  relayClient: RelayClient,
): Promise<void> {
  // Get safe address from relay client
  const safeAddress = relayClient.signer ? await relayClient.signer.getAddress() : null
  if (!safeAddress) {
    throw new Error("Cannot get address from relay client")
  }

  // Check if approvals are already set
  const alreadyApproved = await checkAllApprovals(safeAddress)
  if (alreadyApproved) {
    devLog("[Approvals] All approvals already set, skipping transactions")
    return
  }

  const erc20Spenders = [CTF_ADDRESS, CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER]
  const erc1155Operators = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER]

  const txs = [
    ...erc20Spenders.map((spender) => ({
      to: USDC_ADDRESS,
      operation: OperationType.Call,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, maxUint256],
      }),
      value: "0",
    })),
    ...erc1155Operators.map((operator) => ({
      to: CTF_ADDRESS,
      operation: OperationType.Call,
      data: encodeFunctionData({
        abi: ERC1155_SET_APPROVAL_ABI,
        functionName: "setApprovalForAll",
        args: [operator, true],
      }),
      value: "0",
    })),
  ]

  devLog("[Approvals] Executing", txs.length, "approval transactions...")

  const response = await relayClient.execute(txs, "Set all token approvals for trading")

  devLog("[Approvals] Got response, transactionID:", response.transactionID)

  // Use pollUntilState like deploy does - more reliable than wait()
  const result = await relayClient.pollUntilState(
    response.transactionID,
    [
      RelayerTransactionState.STATE_MINED,
      RelayerTransactionState.STATE_CONFIRMED,
      RelayerTransactionState.STATE_FAILED,
    ],
    "60",
    3000,
  )

  devLog("[Approvals] Poll result:", result)

  if (!result) {
    throw new Error("Token approvals failed - no result from relayer")
  }
}

export async function transferFromSafe(
  relayClient: RelayClient,
  toAddress: string,
  amount: bigint,
): Promise<void> {
  const txn = {
    to: USDC_ADDRESS as string,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [toAddress as `0x${string}`, amount],
    }),
    value: "0",
    operation: OperationType.Call,
  }

  const response = await relayClient.execute([txn], "Withdraw USDC.e")
  await response.wait()
}

export async function transferToSafe(
  walletClient: WalletClient,
  safeAddress: string,
  amount: bigint,
): Promise<string> {
  const account = walletClient.account
  if (!account) throw new Error("Wallet not connected")

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [safeAddress as `0x${string}`, amount],
  })

  const hash = await walletClient.sendTransaction({
    account,
    to: USDC_ADDRESS as `0x${string}`,
    data: transferData,
    chain: walletClient.chain,
  })

  return hash
}

// --- Redeem logic ---

const CTF_REDEEM_ABI = [
  {
    name: "redeemPositions",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    name: "payoutDenominator",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "conditionId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
] as const

const NEG_RISK_REDEEM_ABI = [
  {
    name: "redeemPositions",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`

export async function isConditionResolved(conditionId: string): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: fallback(POLYGON_RPCS.map(url => http(url))),
    })
    const normalizedId = (conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`) as `0x${string}`
    const payoutDenominator = await publicClient.readContract({
      address: CTF_ADDRESS as `0x${string}`,
      abi: CTF_REDEEM_ABI,
      functionName: "payoutDenominator",
      args: [normalizedId],
    })
    return payoutDenominator > BigInt(0)
  } catch (err) {
    devError("[isConditionResolved] Error:", err)
    return false
  }
}

function buildRedeemTxn(
  normalizedConditionId: `0x${string}`,
  negRisk: boolean,
  size: number,
  outcomeIndex: number,
) {
  if (negRisk) {
    const rawAmount = BigInt(Math.round(size * 1e6))
    const amounts = Array.from({ length: Math.max(outcomeIndex + 1, 2) }, (_, i) =>
      i === outcomeIndex ? rawAmount : BigInt(0)
    )
    return {
      to: NEG_RISK_ADAPTER,
      operation: OperationType.Call,
      data: encodeFunctionData({
        abi: NEG_RISK_REDEEM_ABI,
        functionName: "redeemPositions",
        args: [normalizedConditionId, amounts],
      }),
      value: "0",
    }
  }
  return {
    to: CTF_ADDRESS,
    operation: OperationType.Call,
    data: encodeFunctionData({
      abi: CTF_REDEEM_ABI,
      functionName: "redeemPositions",
      args: [USDC_ADDRESS as `0x${string}`, ZERO_BYTES32, normalizedConditionId, [BigInt(1), BigInt(2)]],
    }),
    value: "0",
  }
}

export async function redeemPosition(
  relayClient: RelayClient,
  conditionId: string,
  negRisk: boolean = false,
  size: number = 0,
  outcomeIndex: number = 0,
): Promise<boolean> {
  const normalizedId = (conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`) as `0x${string}`

  if (normalizedId.length !== 66) {
    throw new Error("Invalid condition ID format")
  }

  const resolved = await isConditionResolved(normalizedId)
  if (!resolved) {
    throw new Error("Market is not resolved on-chain yet. Please wait for full resolution before redeeming.")
  }

  const txn = buildRedeemTxn(normalizedId, negRisk, size, outcomeIndex)

  try {
    const response = await relayClient.execute([txn], "Redeem winning tokens")
    await response.wait()
    return true
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes("GS026")) {
      throw new Error("Transaction rejected by Safe. Market may not be resolved yet, or tokens already redeemed.")
    }
    if (errMsg.includes("failed onchain")) {
      throw new Error("Transaction reverted on-chain. Market may not be resolved yet or tokens already redeemed.")
    }
    throw err
  }
}

export async function redeemAllPositions(
  relayClient: RelayClient,
  positions: Array<{ conditionId: string; negRisk: boolean; size: number; outcomeIndex: number }>,
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] }

  const resolvedItems: Array<{ conditionId: string; txn: { to: string; operation: OperationType; data: string; value: string } }> = []

  for (const pos of positions) {
    const normalizedId = (pos.conditionId.startsWith("0x") ? pos.conditionId : `0x${pos.conditionId}`) as `0x${string}`
    const resolved = await isConditionResolved(normalizedId)
    if (!resolved) {
      results.failed++
      results.errors.push(`${normalizedId.slice(0, 10)}...: Not resolved on-chain yet`)
      continue
    }
    resolvedItems.push({
      conditionId: normalizedId,
      txn: buildRedeemTxn(normalizedId, pos.negRisk, pos.size, pos.outcomeIndex),
    })
  }

  if (resolvedItems.length === 0) return results

  // Try batch first (single signature)
  try {
    const response = await relayClient.execute(resolvedItems.map(i => i.txn), "Redeem all positions")
    await response.wait()
    results.success = resolvedItems.length
  } catch {
    // Batch failed — fall back to sequential
    for (const item of resolvedItems) {
      try {
        const response = await relayClient.execute([item.txn], "Redeem position")
        await response.wait()
        results.success++
      } catch (err: unknown) {
        results.failed++
        const errMsg = err instanceof Error ? err.message : "Unknown error"
        results.errors.push(`${item.conditionId.slice(0, 10)}...: ${errMsg.includes("failed onchain") ? "Already redeemed?" : errMsg}`)
      }
    }
  }

  return results
}
