# BID production runbook

This is the canonical launch path. It is deliberately fail-closed and performs
no mainnet write during verification.

## Mainnet input worksheet

These public values are required before the first treasury deployment:

| Value | Recommended owner or source |
| --- | --- |
| `BID_DEPLOYER` | Dedicated deployment EOA backed by an encrypted local keystore |
| `BID_TREASURY_OWNER` | Final Safe or multisig |
| `BID_REWARDS_OWNER` | Safe or multisig that publishes reviewed reward roots |
| `BID_FACTORY_OWNER` | Final Safe or multisig |
| `BID_LIQUIDITY_VAULT_OWNER` | Final Safe or multisig |
| `BID_BUYBACK_VAULT` | Buyback and burn reserve Safe or multisig |
| `BID_PROTOCOL_TREASURY` | Protocol treasury Safe or multisig |
| `BID_CREATOR_REWARDS_VAULT` | Creator rewards reserve Safe or multisig |
| `BID_LIQUIDITY_OPERATOR` | Public address derived from the Railway keeper signer |
| `BID_RESOLUTION_ORACLE` | Dedicated production oracle address |
| `BID_MARKET_CLOSE_TIME` | Approved future Unix timestamp |
| `BID_GENESIS_MARKET_COUNT` | `1` for the capped beta |
| `BID_INITIAL_LIQUIDITY` | `25000000` for the 25 USDG seed |
| `BID_MAX_TRADE_AMOUNT` | `1000000` for the immutable 1 USDG order cap |

The final BID CA and Pons curve are outputs of `LaunchBidOnPons`, not inputs to
the first deployment. `BID_REWARDS_VAULT` is the distributor address printed by
`DeployBidTreasury`; `PONS_POOL_ID` is needed only after graduation.

Secret placement is intentionally small:

- Railway: `RH_RPC_URL` and `KEEPER_PRIVATE_KEY`;
- local deployment machine only: encrypted Foundry keystore and password file;
- Vercel or Sites: no secrets;
- Supabase: no variables because it is not used by this version.

There is no separate "Pons private key" in Railway. The one-time Pons launch is
signed by the local encrypted `BID_DEPLOYER` keystore. Railway uses a different,
limited keeper key; its public address must be both `BID_LIQUIDITY_OPERATOR` and
`KEEPER_EXPECTED_ADDRESS`. The treasury contract, not either wallet, is the Pons
creator-fee recipient.

## 1. Before the token launch

1. Complete an independent audit of `contracts/src` and remediate findings.
2. Finalize the housing data source, resolution edge cases, oracle signer, and
   jurisdiction controls.
3. Reconfirm Pons v2 access and that USDG remains an approved pair asset. The
   verifier requires the Pons quote asset to equal BID market collateral so no
   unreviewed swap executor sits in the money path.
4. Deploy `BidRewardsDistributor`, `BidFlywheelTreasury` and `BidLiquidityVault`
   with the verified Pons escrow, reserve destinations, keeper operator, and final
   multisig addresses. The deployer temporarily owns the treasury and liquidity
   vault until the scripted curve binding and genesis setup hand them to their
   final owners. Record all three addresses.
5. Deploy `BidMarketFactory` without a BID token, then create and fund the one
   capped USDG beta market. Community creation remains disabled. The deployer keeps
   temporary factory ownership only until the final token bind.
6. Keep the website in `prelaunch` and the Railway keeper in read-only mode.

The treasury address printed by `DeployBidTreasury` is the exact address entered
as the Pons `creatorFeeRecipient`. It is a contract, not the deployer wallet. The
treasury owner can change its downstream rewards and reserve destinations without
changing the Pons recipient.

Before any write, `npm run costs:production` also verifies the configured Pons
factory, USDG approval, escrow, hook, tax cap, and current launch economics. When
`BID_DEPLOYER` is present, it fails if Pons currently rejects that launcher.

## 2. Token launch requirements

Launch `$BID` through the verified Pons v2 factory with:

- BID creator fee: exactly `150` bps;
- creator fee recipient: the deployed `BidFlywheelTreasury`;
- buyback: disabled, so the creator bucket is available to the BID flywheel;
- quote asset: the verified asset recorded in `PONS_QUOTE_ASSET`;
- deployer: any approved launch wallet. The curve is bound to the treasury after
  launch so automated creator sweeps do not require the launch wallet.

Do not publish the CA until the factory record is confirmed onchain.

Use `LaunchBidOnPons.s.sol` with an encrypted Foundry keystore. It reads the
metadata and salt from the local launch variables, pins `previewLaunchEconomics`,
and enforces the recipient, tax, pair token and buyback settings before broadcast.
Use `BindBidPonsCurve.s.sol` from the deployer keystore immediately after; it
binds the curve and final BID token exactly once, then transfers treasury and
factory ownership to `BID_TREASURY_OWNER` and `BID_FACTORY_OWNER`.
Run every Foundry script once without `--broadcast` first and review the complete
simulation before signing the mainnet transaction.

After `BindBidPonsCurve` succeeds, the Railway keeper calls the curve through the
treasury, so Pons sees the registered creator recipient as the sweep caller.
Claim already-credited escrow balances before using
`transferPonsCreatorFeeRecipient` to replace the treasury; Pons moves future
fees only.

## Genesis USDG funding

`BID_INITIAL_LIQUIDITY` is the amount per market in six-decimal USDG base units.
The capped beta deploys one market by default and requires that amount in the deployer wallet.
The production script pays from the deployer but mints all initial BID-LP shares
directly to `BID_LIQUIDITY_VAULT`.

| Initial seed | Order cap | Positioning |
| --- | --- | --- |
| 25 USDG (`25000000`) | 1 USDG (`1000000`) | Capped one-market beta |

Zero initial liquidity cannot quote or execute a trade. The 25 USDG seed is protocol-owned
capital, not a fee, and the immutable 1 USDG order cap limits early price impact.
The configured recurring threshold `LP_MIN_DEPLOY_AMOUNT=1000000` batches at least 1 USDG before the
keeper spends gas. `LP_TARGET_DEPTH=100000000` sets a 100 USDG beta target; the
keeper deterministically allocates to approved open markets in proportion to
their actual outcome-pool depth deficits.

## Launch cost check

Run the read-only cost snapshot immediately before launch:

```bash
npm run costs:production
```

It verifies Robinhood Chain ID `4663`, confirms bytecode at the configured Pons
factory, reads the live Pons `launchFee()` and gas price, and shows sample gas
costs without submitting a transaction. It also reports the configured keeper
reserve and, when `BID_INITIAL_LIQUIDITY` is set, the exact capped-beta USDG
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
creator fee and recipient, escrow, quote asset, factory/market wiring, oracle,
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
NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK
NEXT_PUBLIC_BID_REWARDS_VAULT
NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL
NEXT_PUBLIC_BID_LIQUIDITY_VAULT
NEXT_PUBLIC_BID_BUYBACK_VAULT
NEXT_PUBLIC_BID_PROTOCOL_TREASURY
NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT
NEXT_PUBLIC_BID_MARKET_MIA_TPA
NEXT_PUBLIC_BID_MARKET_CITY_FIELD
NEXT_PUBLIC_BID_MARKET_AUSTIN
NEXT_PUBLIC_BID_MAX_TRADE_AMOUNT
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
activity, atomic claim-and-allocation, and balance-consuming LP deposits make
restarts retry-safe. Do not run multiple keeper replicas; concurrent replicas
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
LP_TARGET_DEPTH
```

Add `RH_RPC_URL` and `KEEPER_PRIVATE_KEY` as Railway secrets. The raw key must
never be placed in Vercel, a `NEXT_PUBLIC_*` variable, Git, logs, or shell history.

## 6. Supabase

Supabase is not used by the current application or keeper, so it needs no BID
environment variables and must not receive a signer. The repository does not yet
contain the production event indexer, reward ledger, history database, or payout
records. Choosing Supabase later requires a schema, RLS, unique transaction and
epoch constraints, and server-only service-role writes before any credentials are
added.

## 7. Reward airdrops

The rewards distributor is deployed as `NEXT_PUBLIC_BID_REWARDS_VAULT`, so every
45% LP-rewards allocation funds reserved inventory. An epoch is a one-time
Merkle root over `(epochId, asset, account, amount)` allocations.

1. Produce an approved allocation JSON from finalized time-weighted LP and anti-snapshot rules.
2. Run `npm run rewards:build -- input.json output.json`.
3. Reconcile `totalAllocation` against the distributor's uncommitted balance.
4. Have `BID_REWARDS_OWNER` publish the epoch through its Safe.
5. Confirm the transaction, publish the unchanged proof JSON, and set its HTTPS
   URL as `NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL` in Vercel or Sites.

`publishEpoch` cannot replace an existing epoch or overcommit funds. `claim`
marks the account before transfer and always pays the account encoded in the
proof, making duplicate calls and relayer redirection fail. The owner can recover
only balances not committed to a published epoch.

The `/rewards` interface verifies the manifest asset, root and total allocation
against the contract before enabling a wallet claim. Leave the manifest URL empty
until the first epoch is published; the page then renders an honest awaiting state.

Automated LP scoring is intentionally not invented by the contract. Time-weighted
liquidity, anti-snapshot rules, eligibility windows, exclusions and anti-wash
checks must be implemented and approved before producing the first real allocation file.

## 8. Required systems not implemented

- time-weighted LP reward scoring, anti-snapshot eligibility and epoch allocation approval;
- guarded buyback execution and technically correct BID burn execution;
- creator-market reward scoring and payout execution;
- swap/conversion when Pons fees are not paid in market collateral;
- indexer, history/leaderboard persistence, and operational alerting;
- production oracle methodology, signer process, dispute policy, and monitoring.

These are engineering/product blockers, not values that can be solved by the
final CA or secrets.
