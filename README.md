# BID

BID is a Robinhood Chain real-estate prediction market prototype designed to
connect a $BID token launched through Pons v2 with:

- binary YES/NO housing questions
- city-vs-city matchups
- finite multi-city winner markets
- USDG-backed fixed-product liquidity pools
- market buys in the interface and onchain market buys/sells plus escrowed limit orders
- slippage-protected LP deposits and USDG-first liquidity withdrawals
- funded Merkle reward epochs with duplicate-safe wallet claims
- a future hold-and-burn gate for community market creators

With deployed market addresses configured, the app reads live AMM prices,
requests USDG allowance when needed, and submits Robinhood Chain transactions.
Without those addresses it stays in an explicit prelaunch state and cannot
build an order.

Protocol mechanics, deployment status, and production requirements are
documented at `/docs` in the running application. `/rewards` verifies published
reward manifests against the onchain epoch before preparing a wallet claim.

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
npm run env:check
npm run costs:production
```

`npm run setup:production` runs environment validation, lint, contract tests,
and the Vercel production build. `npm run verify:production` is the read-only
post-CA onchain and frontend verification gate. `npm run costs:production`
reads the current Pons launch fee and Robinhood Chain gas price without sending
a transaction, then shows the lean and recommended genesis-liquidity capital.

## Robinhood Chain + Pons

The interface connects an injected EVM wallet and switches it to Robinhood Chain
(chain ID `4663`). Add the factory and capped genesis market address from the
deployment output to the matching `NEXT_PUBLIC_BID_MARKET_*` variables.

The target Pons v2 launch fixes the BID creator fee at `150` basis points (`1.5%`).
The exact factory, escrow, token, curve, quote asset, and recipient are
configuration values and must pass `npm run verify:production`; none is
silently assumed. The creator-fee recipient must be the BID fee treasury, with
claimed proceeds allocated under `BID_FEE_POLICY_V1`:

- `45%` to the LP rewards reserve;
- `30%` to protocol-owned market liquidity;
- `10%` to the buyback and burn reserve;
- `10%` directly to the protocol treasury;
- `5%` to the market creator rewards reserve.

Pons may charge separate protocol or base fees. BID does not publish an all-in
trading fee until the current production Pons contracts have been verified.

Pons creator fees first accrue on the launch curve or hook, then move to its fee
escrow after a sweep. `BidFlywheelTreasury` calls both sweep paths as the
registered creator recipient, claims its escrow balance, and permissionlessly
splits it. Post-graduation conversions can still require the Pons protocol
operator. Do not enable live mode until all addresses and ownership have been
verified.

The repository includes a single-replica Railway keeper for limit-order fills,
pre-graduation curve sweeps, post-graduation hook sweeps, escrow claims, treasury distribution, and
deployment of the 30% collateral allocation into approved protocol-owned LP by
actual depth deficit. It does not yet implement time-weighted LP reward scoring,
buyback execution, creator-reward scoring, an indexer/history database, or the
production housing oracle policy. Those allocations remain reserves. The funded
reward epoch and wallet claim path is implemented. See `docs/PRODUCTION_RUNBOOK.md`.

## Contracts

The Foundry package under `contracts/` implements 2-8 outcome markets, LP shares,
market buys/sells, limit orders, oracle resolution, redemption, and the disabled
community-creation gate. See `contracts/README.md` for deployment variables.
These contracts are tested prototypes, not audited production contracts.
