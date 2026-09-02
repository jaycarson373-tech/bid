# BID

BID is a Robinhood Chain real-estate prediction market prototype powered by a
$BID token launched through Pons v2. It supports:

- binary YES/NO housing questions
- city-vs-city matchups
- finite multi-city winner markets
- USDG-backed fixed-product liquidity pools
- market buys and escrowed onchain limit orders
- a future hold-and-burn gate for community market creators

With deployed market addresses configured, the app reads live AMM prices,
requests USDG allowance when needed, and submits Robinhood Chain transactions.
Without those addresses it stays in an explicit prelaunch state and cannot
build an order.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

[Import the GitHub repository into Vercel](https://vercel.com/new/clone?repository-url=https://github.com/jaycarson373-tech/bid).
The repository includes a standard Next.js build, a clean lockfile, and
`vercel.json` configuration.

Set `NEXT_PUBLIC_SITE_URL` to the production URL if you attach a custom domain.
Vercel's production URL is detected automatically otherwise.

## Validate

```bash
npm test
npm run lint
npm run test:contracts
npm run test:vercel
```

The first command verifies the rendered BID market board through the
Cloudflare-compatible build. The second runs the same Next.js production build
used by Vercel.

## Robinhood Chain + Pons

The interface connects an injected EVM wallet and switches it to Robinhood Chain
(chain ID `4663`). Add the factory and three genesis market addresses from the
deployment output to the matching `NEXT_PUBLIC_BID_MARKET_*` variables.

$BID is configured for the current Pons v2 factory at
`0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`. Its creator tax is fixed at
`250` basis points (`2.5%`) at launch. The creator-fee recipient must be the BID
fee treasury, with proceeds allocated 50/50:

- `1.25%` of tax-generating trade value to prediction-market rewards;
- `1.25%` of tax-generating trade value to prediction-market liquidity.

Pons creator fees accrue in its fee escrow and must be swept and claimed into
`BidFlywheelTreasury` before anyone calls its permissionless distribution
function. Do not enable live allocation until the BID token, market contracts,
rewards vault, liquidity vault, and treasury ownership have been verified.

## Contracts

The Foundry package under `contracts/` implements 2-8 outcome markets, LP shares,
market buys/sells, limit orders, oracle resolution, redemption, and the disabled
community-creation gate. See `contracts/README.md` for deployment variables.
These contracts are tested prototypes, not audited production contracts.
