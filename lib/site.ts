import { testnetDeployment } from "@/lib/testnetDeployment";
import { mainnetDeployment } from "@/lib/mainnetDeployment";
import feePolicy from "@/config/bid-fee-policy-v1.json";

const PLACEHOLDER = /(<[^>]+>|\b(?:undefined|null|nan|test_token|testnet_address)\b|required|printed|your-project)/i;

// Next.js only inlines public variables accessed with literal property names.
const publicEnvironment = {
  NEXT_PUBLIC_BID_NETWORK: process.env.NEXT_PUBLIC_BID_NETWORK,
  NEXT_PUBLIC_BID_TRADING_ENABLED: process.env.NEXT_PUBLIC_BID_TRADING_ENABLED,
  NEXT_PUBLIC_PONS_VERIFIED: process.env.NEXT_PUBLIC_PONS_VERIFIED,
  NEXT_PUBLIC_BID_RPC_URL: process.env.NEXT_PUBLIC_BID_RPC_URL,
  NEXT_PUBLIC_PONS_URL: process.env.NEXT_PUBLIC_PONS_URL,
  NEXT_PUBLIC_PONS_FACTORY: process.env.NEXT_PUBLIC_PONS_FACTORY,
  NEXT_PUBLIC_BID_MAX_TRADE_AMOUNT: process.env.NEXT_PUBLIC_BID_MAX_TRADE_AMOUNT,
  NEXT_PUBLIC_BID_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_BID_CONTRACT_ADDRESS,
  NEXT_PUBLIC_BID_COLLATERAL_SYMBOL: process.env.NEXT_PUBLIC_BID_COLLATERAL_SYMBOL,
  NEXT_PUBLIC_BID_COLLATERAL_ADDRESS: process.env.NEXT_PUBLIC_BID_COLLATERAL_ADDRESS,
  NEXT_PUBLIC_BID_MARKET_FACTORY: process.env.NEXT_PUBLIC_BID_MARKET_FACTORY,
  NEXT_PUBLIC_BID_FLYWHEEL_TREASURY: process.env.NEXT_PUBLIC_BID_FLYWHEEL_TREASURY,
  NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK: process.env.NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK,
  NEXT_PUBLIC_BID_REWARDS_VAULT: process.env.NEXT_PUBLIC_BID_REWARDS_VAULT,
  NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL: process.env.NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL,
  NEXT_PUBLIC_BID_LIQUIDITY_VAULT: process.env.NEXT_PUBLIC_BID_LIQUIDITY_VAULT,
  NEXT_PUBLIC_BID_BUYBACK_VAULT: process.env.NEXT_PUBLIC_BID_BUYBACK_VAULT,
  NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT: process.env.NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT,
  NEXT_PUBLIC_BID_PROTOCOL_TREASURY: process.env.NEXT_PUBLIC_BID_PROTOCOL_TREASURY,
  NEXT_PUBLIC_BID_MARKET_MIA_TPA: process.env.NEXT_PUBLIC_BID_MARKET_MIA_TPA,
  NEXT_PUBLIC_BID_MARKET_CITY_FIELD: process.env.NEXT_PUBLIC_BID_MARKET_CITY_FIELD,
  NEXT_PUBLIC_BID_MARKET_AUSTIN: process.env.NEXT_PUBLIC_BID_MARKET_AUSTIN,
};

function publicValue(name: keyof typeof publicEnvironment, fallback = "") {
  const value = publicEnvironment[name]?.trim() || fallback;
  return PLACEHOLDER.test(value) ? "" : value;
}

const isTestnet = publicValue("NEXT_PUBLIC_BID_NETWORK", "mainnet") === "testnet";
const isPonsVerified = publicValue("NEXT_PUBLIC_PONS_VERIFIED") === "true";
const marketRetired = !isTestnet && mainnetDeployment.marketRetired;
const isTradingEnabled = publicValue("NEXT_PUBLIC_BID_TRADING_ENABLED", isTestnet ? "false" : "true") === "true"
  && !marketRetired;
// The beta UI starts with this public range; the factory owner can update the
// onchain ceiling and a matching UI release can follow.
const maxTradeAmount = 5;
const allocationTotal = Object.values(feePolicy.allocations).reduce((total, bps) => total + bps, 0);

if (allocationTotal !== feePolicy.basisPoints) {
  throw new Error(`${feePolicy.version} allocations must sum to ${feePolicy.basisPoints} basis points`);
}

export const siteConfig = {
  isTestnet,
  isPonsVerified,
  isTradingEnabled,
  marketRetired,
  networkName: isTestnet ? "Robinhood Chain Testnet" : "Robinhood Chain",
  robinhoodChainId: isTestnet ? 46630 : 4663,
  robinhoodChainHex: isTestnet ? "0xb626" : "0x1237",
  rpcUrl: publicValue(
    "NEXT_PUBLIC_BID_RPC_URL",
    isTestnet
      ? "https://rpc.testnet.chain.robinhood.com"
      : "https://rpc.mainnet.chain.robinhood.com",
  ),
  explorerUrl: isTestnet
    ? "https://explorer.testnet.chain.robinhood.com"
    : "https://robinhoodchain.blockscout.com",
  ponsUrl: publicValue("NEXT_PUBLIC_PONS_URL", "https://docs.ponsfamily.com/"),
  ponsFactory: publicValue(
    "NEXT_PUBLIC_PONS_FACTORY",
    isTestnet ? "" : "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  ),
  feePolicyVersion: feePolicy.version,
  creatorTaxBps: feePolicy.creatorFeeBps,
  lpRewardsShareBps: feePolicy.allocations.lpRewards,
  marketLiquidityShareBps: feePolicy.allocations.marketLiquidity,
  buybackBurnShareBps: feePolicy.allocations.buybackBurn,
  treasuryShareBps: feePolicy.allocations.treasury,
  creatorRewardsShareBps: feePolicy.allocations.creatorRewards,
  minTradeAmount: 5,
  maxTradeAmount,
  nextMinTradeAmount: 5,
  nextMaxTradeAmount: 50,
  contractAddress: publicValue(
    "NEXT_PUBLIC_BID_CONTRACT_ADDRESS",
    isTestnet ? testnetDeployment.bidTokenAddress : "",
  ),
  collateralSymbol: publicValue("NEXT_PUBLIC_BID_COLLATERAL_SYMBOL", isTestnet ? "tUSDG" : "USDG"),
  collateralAddress: publicValue(
    "NEXT_PUBLIC_BID_COLLATERAL_ADDRESS",
    isTestnet ? testnetDeployment.collateralAddress : "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  ),
  marketFactoryAddress: publicValue(
    "NEXT_PUBLIC_BID_MARKET_FACTORY",
    isTestnet ? testnetDeployment.marketFactoryAddress : mainnetDeployment.marketFactoryAddress,
  ),
  flywheelTreasuryAddress: publicValue(
    "NEXT_PUBLIC_BID_FLYWHEEL_TREASURY",
    isTestnet ? testnetDeployment.flywheelTreasuryAddress : mainnetDeployment.flywheelTreasuryAddress,
  ),
  flywheelDeploymentBlock: publicValue(
    "NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK",
    isTestnet ? "" : mainnetDeployment.deploymentBlock,
  ),
  rewardsVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_REWARDS_VAULT",
    isTestnet ? testnetDeployment.rewardsVaultAddress : mainnetDeployment.rewardsVaultAddress,
  ),
  rewardsManifestUrl: publicValue("NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL"),
  liquidityVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_LIQUIDITY_VAULT",
    isTestnet ? testnetDeployment.liquidityVaultAddress : mainnetDeployment.liquidityVaultAddress,
  ),
  buybackVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_BUYBACK_VAULT",
    isTestnet ? testnetDeployment.buybackVaultAddress : mainnetDeployment.buybackVaultAddress,
  ),
  creatorRewardsVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT",
    isTestnet ? testnetDeployment.creatorRewardsVaultAddress : mainnetDeployment.creatorRewardsVaultAddress,
  ),
  protocolTreasuryAddress: publicValue(
    "NEXT_PUBLIC_BID_PROTOCOL_TREASURY",
    isTestnet ? testnetDeployment.protocolTreasuryAddress : mainnetDeployment.protocolTreasuryAddress,
  ),
  marketAddresses: {
    miamiTampa: publicValue(
      "NEXT_PUBLIC_BID_MARKET_MIA_TPA",
      isTestnet ? testnetDeployment.marketAddresses.miamiTampa : mainnetDeployment.marketAddresses.miamiTampa,
    ),
    cityField: publicValue(
      "NEXT_PUBLIC_BID_MARKET_CITY_FIELD",
      isTestnet ? testnetDeployment.marketAddresses.cityField : mainnetDeployment.marketAddresses.cityField,
    ),
    austinPositive: publicValue(
      "NEXT_PUBLIC_BID_MARKET_AUSTIN",
      isTestnet ? testnetDeployment.marketAddresses.austinPositive : mainnetDeployment.marketAddresses.austinPositive,
    ),
  },
  marketDeploymentBlocks: isTestnet
    ? { miamiTampa: "", cityField: "", austinPositive: "" }
    : mainnetDeployment.marketDeploymentBlocks,
};
