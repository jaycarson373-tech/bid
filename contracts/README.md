# BID market contracts

This package contains the Robinhood Chain prediction-market MVP:

- `BidMarket`: a 2-8 outcome fixed-product AMM with collateral-backed outcome
  balances, LP shares, market buys/sells, fillable limit orders, resolution,
  and redemption. LP deposits and direct-to-collateral withdrawals both use
  caller-provided minimums; imbalanced withdrawal inventory remains available
  to the LP as outcome balances.
- `BidMarketFactory`: owner-created launch markets plus a disabled-by-default
  community path with $BID holding, burn, and creator-royalty settings. Genesis
  markets can be deployed before the BID token exists; the token can be bound
  once by the owner after its verified Pons launch.
- `BidFlywheelTreasury`: claims its configured Pons escrow balance and splits
  native or ERC-20 balances 45/30/10/10/5 between LP rewards, protocol-owned
  liquidity, buyback and burn, protocol treasury, and creator rewards.
- `BidRewardsDistributor`: holds the 45% LP-rewards allocation in funded immutable Merkle
  epochs, prevents duplicate claims, and pays each proof to its entitled wallet.
- `BidLiquidityVault`: holds the liquidity allocation and lets a dedicated
  operator add it only to owner-approved BID markets while the owner retains
  removal and recovery control.

Genesis markets are created with a `0` bps market fee. Users still pay network
gas. Future community markets can charge a creator royalty up to 3%, but that
path cannot be used until the factory owner explicitly enables it.

The intended mainnet collateral is Robinhood Chain's canonical USDG at
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. Verify the address against the
official Robinhood Chain registry before deployment.

## Test

```bash
forge test --root contracts
```

## Deploy

### Robinhood Chain Testnet

`DeployBidTestnet` creates disposable tUSDG and tBID tokens, separate rewards
and liquidity vaults, the flywheel treasury, the market factory, and three
genesis pools seeded with 100,000 tUSDG each. The tUSDG faucet allows wallets
to claim up to 50,000 test tokens once per hour. These assets have no value and
must never be presented as mainnet tokens.

From `contracts/`, set the public deployer address and broadcast with an
encrypted Foundry keystore:

```bash
export RH_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
export BID_TESTNET_DEPLOYER=0x...

forge script script/DeployBidTestnet.s.sol:DeployBidTestnet \
  --rpc-url "$RH_TESTNET_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

Copy the emitted `NEXT_PUBLIC_*` addresses into `lib/testnetDeployment.ts`,
then run the signed smoke test. It executes a buy, LP deposit and withdrawal,
resting limit creation and cancellation, and a 45/30/10/10/5 tBID treasury split.

```bash
export NEXT_PUBLIC_BID_CONTRACT_ADDRESS=0x...
export NEXT_PUBLIC_BID_MARKET_MIA_TPA=0x...
export NEXT_PUBLIC_BID_FLYWHEEL_TREASURY=0x...

forge script script/SmokeTestBidTestnet.s.sol:SmokeTestBidTestnet \
  --rpc-url "$RH_TESTNET_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

### Robinhood Chain Mainnet

Deploy the treasury before the token so its address can be fixed as the Pons v2
creator-fee recipient. Use an encrypted Foundry keystore; never commit or pass a
raw key through a shell argument.

```bash
export RH_RPC_URL=https://rpc.mainnet.chain.robinhood.com
export BID_EXPECTED_CHAIN_ID=4663
export BID_DEPLOYER=0x...
export BID_TREASURY_OWNER=0x...
export BID_REWARDS_OWNER=0x...
export BID_COLLATERAL_TOKEN=0x...
export PONS_FACTORY=0x...
export BID_BUYBACK_VAULT=0x...
export BID_PROTOCOL_TREASURY=0x...
export BID_CREATOR_REWARDS_VAULT=0x...
export BID_LIQUIDITY_OPERATOR=0x...
export PONS_FEE_ESCROW=0x...
export PONS_FEE_HOOK=0x...
forge script script/DeployBidTreasury.s.sol:DeployBidTreasury \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

This deployment prints `NEXT_PUBLIC_BID_REWARDS_VAULT` for the new rewards
distributor. Use that output everywhere the frontend or verifier asks for the
LP rewards reserve; do not substitute a personal wallet.

Before the token launch, deploy the market factory without a BID token address,
then seed the three USDG genesis markets. The factory stays temporarily owned by
the deployer so the final token can be bound once after launch.

```bash
export BID_RESOLUTION_ORACLE=0x...
export BID_MAX_TRADE_AMOUNT=1000000
forge script script/DeployBidMarkets.s.sol:DeployBidMarkets \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast

export BID_MARKET_FACTORY=0x...
export BID_LIQUIDITY_VAULT=0x...
export BID_LIQUIDITY_VAULT_OWNER=0x...
export BID_MARKET_CLOSE_TIME=1798761599
export BID_GENESIS_MARKET_COUNT=1
export BID_INITIAL_LIQUIDITY=25000000
forge script script/CreateGenesisMarkets.s.sol:CreateGenesisMarkets \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

Launch BID through Pons only after recording the deployed treasury. The script
pins the current economics, requires an approved USDG pair, checks launcher
eligibility and tax limits, forces the treasury to be the fee recipient, fixes
the creator fee at 1.5%, and keeps Pons buyback disabled.

```bash
export BID_FLYWHEEL_TREASURY=0x...
export PONS_QUOTE_ASSET=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
export PONS_LAUNCH_CONFIG_ID=0
export BID_TOKEN_LOGO_URI=https://bid-ten-zeta.vercel.app/brand/bid-logo.jpg
export BID_TOKEN_DESCRIPTION='RWA housing prediction markets on Robinhood Chain, powered by BID and Pons.'
export BID_SOCIAL_WEBSITE=https://bid-ten-zeta.vercel.app
export BID_PONS_SALT="0x$(openssl rand -hex 32)"
forge script script/LaunchBidOnPons.s.sol:LaunchBidOnPons \
  --rpc-url "$RH_RPC_URL"

# Only after the dry run succeeds and every printed value is reviewed:
forge script script/LaunchBidOnPons.s.sol:LaunchBidOnPons \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

The launch output is the final BID CA and Pons curve address. The deployment
wallet temporarily owns the treasury and market factory. The binding script
verifies the Pons record, binds the curve and final BID token once, then transfers
ownership to `BID_TREASURY_OWNER` and `BID_FACTORY_OWNER`:

```bash
export BID_TOKEN_ADDRESS=0x...
export PONS_CURVE_ADDRESS=0x...
forge script script/BindBidPonsCurve.s.sol:BindBidPonsCurve \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

Production deployment requires an independent contract review, a finalized
resolution policy, verified treasury/oracle ownership, and enough USDG to seed
each genesis market. The deployed `BidFlywheelTreasury` address must be set as
the Pons v2 creator-fee recipient when $BID launches. The 1.5% creator-fee rate
is fixed at token creation; Pons v2 can redirect future creator earnings to a
new recipient, so production operations must monitor that setting.
The capped beta example seeds one market with 25 USDG and enforces a 1 USDG
maximum order in the market contract. Initial
BID-LP shares are minted to the liquidity vault rather than the deployer.

## Reward epochs

Pons fees claimed by the treasury are allocated immediately and atomically. The
45% LP-rewards share funds `BidRewardsDistributor`; funding alone does not assign
rewards. Generate a
reviewable Merkle epoch from an approved JSON allocation. The input contains
`epochId`, `asset`, `decimals`, and a `rewards` array of EVM `account` and
decimal `amount` records.

```bash
npm run rewards:build -- rewards-epoch-1.json rewards-epoch-1-proof.json
```

The owner Safe then calls
`publishEpoch(epochId, asset, merkleRoot, totalAllocation)` using the generated
values. The contract refuses duplicate epochs and allocations larger than its
uncommitted balance. A user or relayer calls
`claim(epochId, account, amount, proof)`; payment always goes to `account`, so a
relayer cannot redirect it. Publish the unchanged proof JSON at the rewards
manifest URL after the onchain root is confirmed.

Do not publish an LP reward epoch until the time-weighted liquidity and
anti-snapshot eligibility policy has been implemented and independently reviewed.
