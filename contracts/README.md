# BID market contracts

This package contains the Robinhood Chain prediction-market MVP:

- `BidMarket`: a 2-8 outcome fixed-product AMM with collateral-backed outcome
  balances, LP shares, market buys/sells, fillable limit orders, resolution,
  and redemption. LP deposits and direct-to-collateral withdrawals both use
  caller-provided minimums; imbalanced withdrawal inventory remains available
  to the LP as outcome balances.
- `BidMarketFactory`: owner-created launch markets plus a disabled-by-default
  community path with $BID holding, burn, and creator-royalty settings.
- `BidFlywheelTreasury`: claims its configured Pons escrow balance and splits
  native or ERC-20 balances 70/20/10 between rewards, protocol-owned liquidity,
  and the protocol reserve.
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
resting limit creation and cancellation, and a 70/20/10 tBID treasury split.

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
export BID_COLLATERAL_TOKEN=0x...
export PONS_FACTORY=0x...
export BID_REWARDS_VAULT=0x...
export BID_RESERVE_VAULT=0x...
export BID_LIQUIDITY_OPERATOR=0x...
export PONS_FEE_ESCROW=0x...
forge script script/DeployBidTreasury.s.sol:DeployBidTreasury \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

After the token launches, the treasury owner first calls
`setPonsCurve(PONS_CURVE_ADDRESS)`. Once the CA and binding pass the Pons-record
checks, deploy the factory. `BID_COLLATERAL_TOKEN` must be the verified collateral
address and `BID_TOKEN_ADDRESS` is the final CA.

```bash
export BID_COLLATERAL_TOKEN=0x...
export BID_TOKEN_ADDRESS=0x...
export BID_FLYWHEEL_TREASURY=0x...
export PONS_FACTORY=0x...
export PONS_CURVE_ADDRESS=0x...
export BID_RESOLUTION_ORACLE=0x...
forge script script/DeployBidMarkets.s.sol:DeployBidMarkets \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

After the factory owner has funded the deployment wallet with USDG, create and
seed the three launch markets. `BID_MARKET_CLOSE_TIME` is a Unix timestamp and
`BID_INITIAL_LIQUIDITY` uses the collateral token's smallest unit.

```bash
export BID_MARKET_FACTORY=0x...
export BID_LIQUIDITY_VAULT=0x...
export BID_LIQUIDITY_VAULT_OWNER=0x...
export BID_MARKET_CLOSE_TIME=1798761599
export BID_INITIAL_LIQUIDITY=25000000000
forge script script/CreateGenesisMarkets.s.sol:CreateGenesisMarkets \
  --rpc-url "$RH_RPC_URL" \
  --keystore /path/to/deployer-keystore \
  --password-file /path/to/password-file \
  --broadcast
```

Production deployment requires an independent contract review, a finalized
resolution policy, verified treasury/oracle ownership, and enough USDG to seed
each genesis market. The deployed `BidFlywheelTreasury` address must be set as
the Pons v2 creator-fee recipient when $BID launches. The 2.5% creator-tax rate
is fixed at token creation; Pons v2 can redirect future creator earnings to a
new recipient, so production operations must monitor that setting.
The example seeds 25,000 USDG per market, requiring 75,000 USDG total. Initial
BID-LP shares are minted to the liquidity vault rather than the deployer.
