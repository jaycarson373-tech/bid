# BID production runbook

This is the canonical launch path. It is deliberately fail-closed and performs
no mainnet write during verification.

## 1. Before the token launch

1. Complete an independent audit of `contracts/src` and remediate findings.
2. Finalize the housing data source, resolution edge cases, oracle signer, and
   jurisdiction controls.
3. Reconfirm Pons v2 access and that USDG remains an approved pair asset. The
   verifier requires the Pons quote asset to equal BID market collateral so no
   unreviewed swap executor sits in the money path.
4. Deploy `BidFlywheelTreasury` and `BidLiquidityVault` with the verified Pons
   escrow, rewards and reserve destinations, keeper operator, and multisig owners.
   Record both addresses.
5. Keep the website in `prelaunch` and the Railway keeper in read-only mode.

The treasury address printed by `DeployBidTreasury` is the exact address entered
as the Pons `creatorFeeRecipient`. It is a contract, not the deployer wallet. The
treasury owner can change its downstream rewards and reserve destinations without
changing the Pons recipient.

## 2. Token launch requirements

Launch `$BID` through the verified Pons v2 factory with:

- creator tax: exactly `250` bps;
- creator fee recipient: the deployed `BidFlywheelTreasury`;
- buyback: disabled, so the creator bucket is available to the BID flywheel;
- quote asset: the verified asset recorded in `PONS_QUOTE_ASSET`;
- deployer: any approved launch wallet. The curve is bound to the treasury after
  launch so automated creator sweeps do not require the launch wallet.

Do not publish the CA until the factory record is confirmed onchain.

After launch, the treasury owner must call `setPonsCurve(PONS_CURVE_ADDRESS)`.
The Railway keeper then calls the curve through the treasury, so Pons sees the
registered creator recipient as the sweep caller. Claim already-credited escrow
balances before using `transferPonsCreatorFeeRecipient` to replace the treasury;
Pons moves future fees only.

## Genesis USDG funding

`BID_INITIAL_LIQUIDITY` is the amount per market in six-decimal USDG base units.
The three genesis markets require three times that amount in the deployer wallet.
The production script pays from the deployer but mints all initial BID-LP shares
directly to `BID_LIQUIDITY_VAULT`.

| Per market | Total for three | Positioning |
| --- | --- | --- |
| 5,000 USDG (`5000000000`) | 15,000 USDG | Thin beta |
| 10,000 USDG (`10000000000`) | 30,000 USDG | Lean public launch |
| 25,000 USDG (`25000000000`) | 75,000 USDG | Recommended launch target |

At 25,000 USDG per pool, a 500 USDG opening trade moves a binary market from
50% to roughly 51% spot and a five-outcome market from 20% to roughly 21.6% spot.
These are curve-depth estimates, not guaranteed fills. The configured recurring
threshold `LP_MIN_DEPLOY_AMOUNT=100000000` batches at least 100 USDG per eligible
market before the keeper spends gas; the keeper divides the vault balance evenly
across open approved markets.

## Launch cost check

Run the read-only cost snapshot immediately before launch:

```bash
npm run costs:production
```

It verifies Robinhood Chain ID `4663`, confirms bytecode at the configured Pons
factory, reads the live Pons `launchFee()` and gas price, and shows sample gas
costs without submitting a transaction. It also reports the configured keeper
reserve and, when `BID_INITIAL_LIQUIDITY` is set, the exact three-market USDG
capital requirement.

Treat these separately:

- Pons launch fee: a protocol cost read from the factory at launch time;
- deployment and keeper gas: variable ETH spent on successful transactions;
- genesis USDG: protocol-owned LP capital, not a fee;
- hosting, RPC, monitoring, legal review and independent audit: external vendor
  costs that this repository cannot price.

## 3. Bind and verify

Create `.env.production.local` from `.env.production.example`, then fill only
public addresses and public expected values locally. Add secrets directly in
the destination secret manager, never to the file or Git.

```bash
npm run env:check
npm run verify:production
```

The verifier checks chain ID, bytecode, token metadata, Pons launch record,
creator tax and recipient, escrow, quote asset, factory/market wiring, oracle,
hook binding, ownership, market close times, funded pools, live quotes, keeper identity and
gas balance when enabled, plus the deployed frontend CA and placeholder scan.

## 4. Vercel or Sites

Add only these public values. Vercel receives no private key, private RPC URL,
database service key, or signer credential:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_LAUNCH_STATE
NEXT_PUBLIC_BID_NETWORK
NEXT_PUBLIC_BID_RPC_URL
NEXT_PUBLIC_PONS_URL
NEXT_PUBLIC_BID_COLLATERAL_SYMBOL
NEXT_PUBLIC_CREATOR_TAX_BPS
NEXT_PUBLIC_PONS_VERIFIED
NEXT_PUBLIC_PONS_FACTORY
NEXT_PUBLIC_BID_CONTRACT_ADDRESS
NEXT_PUBLIC_BID_COLLATERAL_ADDRESS
NEXT_PUBLIC_BID_MARKET_FACTORY
NEXT_PUBLIC_BID_FLYWHEEL_TREASURY
NEXT_PUBLIC_BID_REWARDS_VAULT
NEXT_PUBLIC_BID_LIQUIDITY_VAULT
NEXT_PUBLIC_BID_RESERVE_VAULT
NEXT_PUBLIC_BID_MARKET_MIA_TPA
NEXT_PUBLIC_BID_MARKET_CITY_FIELD
NEXT_PUBLIC_BID_MARKET_AUSTIN
```

Build with `npm ci` and `npm run build`. Attach the production domain, apply the
DNS record Vercel or Sites returns, and set `NEXT_PUBLIC_SITE_URL` to its HTTPS
origin. Keep `NEXT_PUBLIC_LAUNCH_STATE=prelaunch` until the final verification.

## 5. Railway keeper

Create one Railway service from this repository using `Dockerfile.keeper`, one
replica, and `/` as the health path. Add all keeper/server variables from
`.env.production.example`; add `KEEPER_PRIVATE_KEY` directly in Railway. Set
`KEEPER_EXECUTION_ENABLED=false` for the first deployment. The process listens
on Railway's `PORT`, validates the RPC chain before becoming healthy, and never
returns or logs the private key.

After read-only production verification passes, set
`KEEPER_EXECUTION_ENABLED=true` and `LP_DEPLOYMENT_ENABLED=true`. Onchain order
activity, zero-before-transfer fee accounting, and balance-consuming LP deposits
make restarts retry-safe. Do not run multiple keeper replicas; concurrent replicas
waste gas on races even though duplicate settlement reverts.

After Pons graduation, set the computed `PONS_POOL_ID` and enable
`PONS_HOOK_SWEEP_ENABLED`. The treasury calls the configured Pons hook as the
creator recipient. A sweep requiring internal token conversion can still require
Pons' protocol operator; a failed simulation leaves funds untouched and marks the
keeper unhealthy for operator intervention.

Railway needs the `NEXT_PUBLIC_BID_*` contract/market addresses used by the
keeper plus these server-only values:

```text
BID_EXPECTED_CHAIN_ID
PONS_FEE_ESCROW
PONS_FEE_HOOK
PONS_CURVE_ADDRESS
PONS_POOL_ID
PONS_QUOTE_ASSET
PONS_QUOTE_ASSETS
PONS_CURVE_SWEEP_ENABLED
PONS_HOOK_SWEEP_ENABLED
PONS_MIN_CONVERSION_QUOTE_OUT
KEEPER_EXPECTED_ADDRESS
KEEPER_MARKETS
KEEPER_EXECUTION_ENABLED
KEEPER_POLL_INTERVAL_MS
KEEPER_MAX_ORDER_SCAN
KEEPER_MIN_BALANCE_WEI
LP_DEPLOYMENT_ENABLED
LP_MIN_DEPLOY_AMOUNT
```

Add `RH_RPC_URL` and `KEEPER_PRIVATE_KEY` as Railway secrets. The raw key must
never be placed in Vercel, a `NEXT_PUBLIC_*` variable, Git, logs, or shell history.

## 6. Required systems not implemented

- reward scoring, epoch snapshots, payout calculation, and reward receipts;
- swap/conversion when Pons fees are not paid in market collateral;
- indexer, history/leaderboard persistence, and operational alerting;
- production oracle methodology, signer process, dispute policy, and monitoring.

These are engineering/product blockers, not values that can be solved by the
final CA or secrets.
