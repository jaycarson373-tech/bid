import { testnetDeployment } from "@/lib/testnetDeployment";
import feePolicy from "@/config/bid-fee-policy-v1.json";

const PLACEHOLDER = /(<[^>]+>|\b(?:undefined|null|nan|test_token|testnet_address)\b|required|printed|your-project)/i;

function publicValue(name: string, fallback = "") {
  const value = process.env[name]?.trim() || fallback;
  return PLACEHOLDER.test(value) ? "" : value;
}

const isTestnet = publicValue("NEXT_PUBLIC_BID_NETWORK", "mainnet") === "testnet";
const isPonsVerified = publicValue("NEXT_PUBLIC_PONS_VERIFIED") === "true";
const allocationTotal = Object.values(feePolicy.allocations).reduce((total, bps) => total + bps, 0);

if (allocationTotal !== feePolicy.basisPoints) {
  throw new Error(`${feePolicy.version} allocations must sum to ${feePolicy.basisPoints} basis points`);
}

export const siteConfig = {
  isTestnet,
  isPonsVerified,
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
  maxTradeAmount: Number(publicValue("NEXT_PUBLIC_BID_MAX_TRADE_AMOUNT", "1")),
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
    isTestnet ? testnetDeployment.marketFactoryAddress : "",
  ),
  flywheelTreasuryAddress: publicValue(
    "NEXT_PUBLIC_BID_FLYWHEEL_TREASURY",
    isTestnet ? testnetDeployment.flywheelTreasuryAddress : "",
  ),
  flywheelDeploymentBlock: publicValue("NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK"),
  rewardsVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_REWARDS_VAULT",
    isTestnet ? testnetDeployment.rewardsVaultAddress : "",
  ),
  rewardsManifestUrl: publicValue("NEXT_PUBLIC_BID_REWARDS_MANIFEST_URL"),
  liquidityVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_LIQUIDITY_VAULT",
    isTestnet ? testnetDeployment.liquidityVaultAddress : "",
  ),
  buybackVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_BUYBACK_VAULT",
    isTestnet ? testnetDeployment.buybackVaultAddress : "",
  ),
  creatorRewardsVaultAddress: publicValue(
    "NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT",
    isTestnet ? testnetDeployment.creatorRewardsVaultAddress : "",
  ),
  protocolTreasuryAddress: publicValue(
    "NEXT_PUBLIC_BID_PROTOCOL_TREASURY",
    isTestnet ? testnetDeployment.protocolTreasuryAddress : "",
  ),
  marketAddresses: {
    miamiTampa: publicValue(
      "NEXT_PUBLIC_BID_MARKET_MIA_TPA",
      isTestnet ? testnetDeployment.marketAddresses.miamiTampa : "",
    ),
    cityField: publicValue(
      "NEXT_PUBLIC_BID_MARKET_CITY_FIELD",
      isTestnet ? testnetDeployment.marketAddresses.cityField : "",
    ),
    austinPositive: publicValue(
      "NEXT_PUBLIC_BID_MARKET_AUSTIN",
      isTestnet ? testnetDeployment.marketAddresses.austinPositive : "",
    ),
  },
};
