import { createConfig, http } from "wagmi"
import { polygon } from "wagmi/chains"
import { injected } from "wagmi/connectors"

const POLYGON_RPC = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || "https://polygon.drpc.org"

export const config = createConfig({
  chains: [polygon],
  connectors: [injected()],
  transports: {
    [polygon.id]: http(POLYGON_RPC),
  },
  ssr: true,
})