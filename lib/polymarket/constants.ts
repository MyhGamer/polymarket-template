export const CHAIN_ID = 137

// Proxied through /api/clob to keep builder credentials server-side
export const CLOB_URL = "/api/clob"
export const RELAYER_URL = "/api/relayer"

// RPC URLs with fallback
export const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
]
export const POLYGON_RPC_URL = POLYGON_RPCS[0]

export const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const
export const USDC_E_CONTRACT_ADDRESS = USDC_ADDRESS // Alias for compatibility
export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const
export const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const
export const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const

// Aliases for clarity
export const NEG_RISK_ADAPTER_ADDRESS = NEG_RISK_ADAPTER

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const

export const ERC20_APPROVAL_ABI = [
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
