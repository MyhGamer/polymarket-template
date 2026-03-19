# Prediction Market Starter Kit

A fork of [suhailkakar/prediction-market-starter-kit](https://github.com/suhailkakar/prediction-market-starter-kit) rebuilt with wagmi instead of Privy, plus limit orders, position redemption, deposits/withdrawals with bridging, and other improvements.

Fully ready to run — just add your env keys and go. (there can be a lot bugs cuz claude is stupid sometimes :) use on your own risk)

**Repo:** [github.com/MyhGamer/polymarket-template](https://github.com/MyhGamer/polymarket-template)

## What's different from the original

- **wagmi instead of Privy** — Standard wallet connection (MetaMask, WalletConnect, etc.) instead of Privy embedded wallets
- **Limit orders** — GTC limit orders via CLOB orderbook, click-to-fill from orderbook depth
- **Market orders** — FAK market orders with slippage protection
- **Redeem positions** — Redeem winning tokens after market resolution (single + batch), neg-risk market support
- **Deposits & withdrawals** — Transfer USDC.e to/from Safe trading wallet
- **Bridge** — Bridge funds to Polygon for trading
- **Order management** — View and cancel open orders from portfolio
- **Position tracking** — Position badges on event pages with avg price and size
- **Live updates** — Balances and positions auto-refresh after every trade
- **Server-side builder auth** — CLOB proxy with HMAC signing, secrets never reach the client

## Quick start

```bash
git clone https://github.com/MyhGamer/polymarket-template.git
cd polymarket-template
pnpm install
```

Create `.env.local` with your keys:

```env
POLYMARKET_BUILDER_API_KEY=your-builder-api-key
POLYMARKET_BUILDER_SECRET=your-builder-secret
POLYMARKET_BUILDER_PASSPHRASE=your-builder-passphrase
```

Get builder credentials at [polymarket.com/settings?tab=builder](https://polymarket.com/settings?tab=builder).

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — that's it, fully working site.

## Architecture

```
app/                    → Next.js App Router pages
app/api/clob/           → CLOB proxy (adds builder auth server-side)
app/api/gamma/          → Gamma API proxy (avoids CORS)
app/api/relayer/        → Relayer proxy for Safe operations
components/             → React components (shadcn/ui)
hooks/                  → Balance, session, orders hooks
lib/polymarket/         → CLOB client, relayer, trading logic
lib/                    → Gamma API, Data API, price utils
```

## How trading works

1. User connects wallet (MetaMask, WalletConnect, etc.)
2. First trade triggers one-time setup: Safe deploy → token approvals → CLOB API keys (all gasless)
3. Session cached in localStorage — returning users trade instantly
4. Orders signed client-side (EIP-712), proxied through `/api/clob` with server-side HMAC builder auth
5. After trade: balances + positions refresh everywhere automatically

## Tech stack

| Layer      | Tech                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| Framework  | [Next.js 16](https://nextjs.org) (App Router, Turbopack)                           |
| Wallets    | [wagmi](https://wagmi.sh) + [viem](https://viem.sh)                                |
| Trading    | [Polymarket CLOB](https://docs.polymarket.com) (market + limit orders, FAK/GTC)    |
| Onboarding | [Polymarket Relayer](https://docs.polymarket.com) (gasless Safe deploy + approvals) |
| Styling    | [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)     |
| Charts     | [Recharts](https://recharts.org)                                                   |
| Chain      | Polygon PoS (USDC.e, CTF outcome tokens)                                           |

## Scripts

```bash
pnpm dev        # Dev server (Turbopack)
pnpm build      # Production build
pnpm start      # Production server
pnpm lint       # ESLint
pnpm typecheck  # TypeScript checks
```

## License

MIT
