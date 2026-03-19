import type { WalletClient } from "viem"

/**
 * Converts viem WalletClient to a lightweight signer adapter
 * compatible with @polymarket/clob-client (getAddress, signMessage, _signTypedData)
 */
export function walletClientToSigner(walletClient: WalletClient) {
  const account = walletClient.account
  if (!account) throw new Error("walletClient has no account")

  return {
    getAddress: async () => account.address,

    signMessage: async (message: string) => {
      return walletClient.signMessage({
        account,
        message,
      })
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _signTypedData: async (domain: any, types: any, value: any) => {
      const primaryType = Object.keys(types).find(key => key !== "EIP712Domain") || ""

      return walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType,
        message: value,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    },

    provider: {
      getNetwork: async () => ({ chainId: Number(walletClient.chain?.id || 137) }),
    },
  }
}

export type ViemSigner = ReturnType<typeof walletClientToSigner>
