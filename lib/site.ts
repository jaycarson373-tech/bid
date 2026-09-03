import { testnetDeployment } from "@/lib/testnetDeployment";

const isTestnet = (process.env.NEXT_PUBLIC_BID_NETWORK?.trim() || "testnet") === "testnet";

export const siteConfig = {
  isTestnet,
  networkName: isTestnet ? "Robinhood Chain Testnet" : "Robinhood Chain",
  robinhoodChainId: isTestnet ? 46630 : 4663,
  robinhoodChainHex: isTestnet ? "0xb626" : "0x1237",
  rpcUrl: isTestnet
    ? "https://rpc.testnet.chain.robinhood.com"
    : "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: isTestnet
    ? "https://explorer.testnet.chain.robinhood.com"
    : "https://robinhoodchain.blockscout.com",
  ponsUrl: "https://docs.ponsfamily.com/v2",
  ponsFactory:
    process.env.NEXT_PUBLIC_PONS_FACTORY?.trim() ||
    "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  creatorTaxBps: 250,
  liquidityShareBps: 5_000,
  predictionRewardsShareBps: 5_000,
  contractAddress:
    process.env.NEXT_PUBLIC_BID_CONTRACT_ADDRESS?.trim() ||
    (isTestnet ? testnetDeployment.bidTokenAddress : ""),
  collateralSymbol: isTestnet ? "tUSDG" : "USDG",
  collateralAddress:
    process.env.NEXT_PUBLIC_BID_COLLATERAL_ADDRESS?.trim() ||
    (isTestnet
      ? testnetDeployment.collateralAddress
      : "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
  marketFactoryAddress:
    process.env.NEXT_PUBLIC_BID_MARKET_FACTORY?.trim() ||
    (isTestnet ? testnetDeployment.marketFactoryAddress : ""),
  flywheelTreasuryAddress:
    process.env.NEXT_PUBLIC_BID_FLYWHEEL_TREASURY?.trim() ||
    (isTestnet ? testnetDeployment.flywheelTreasuryAddress : ""),
  rewardsVaultAddress:
    process.env.NEXT_PUBLIC_BID_REWARDS_VAULT?.trim() ||
    (isTestnet ? testnetDeployment.rewardsVaultAddress : ""),
  liquidityVaultAddress:
    process.env.NEXT_PUBLIC_BID_LIQUIDITY_VAULT?.trim() ||
    (isTestnet ? testnetDeployment.liquidityVaultAddress : ""),
  marketAddresses: {
    miamiTampa:
      process.env.NEXT_PUBLIC_BID_MARKET_MIA_TPA?.trim() ||
      (isTestnet ? testnetDeployment.marketAddresses.miamiTampa : ""),
    cityField:
      process.env.NEXT_PUBLIC_BID_MARKET_CITY_FIELD?.trim() ||
      (isTestnet ? testnetDeployment.marketAddresses.cityField : ""),
    austinPositive:
      process.env.NEXT_PUBLIC_BID_MARKET_AUSTIN?.trim() ||
      (isTestnet ? testnetDeployment.marketAddresses.austinPositive : ""),
  },
};
