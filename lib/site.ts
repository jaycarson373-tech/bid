export const siteConfig = {
  networkName: "Robinhood Chain",
  robinhoodChainId: 4663,
  robinhoodChainHex: "0x1237",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  ponsUrl: "https://docs.ponsfamily.com/v2",
  ponsFactory:
    process.env.NEXT_PUBLIC_PONS_FACTORY?.trim() ||
    "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  creatorTaxBps: 250,
  liquidityShareBps: 5_000,
  predictionRewardsShareBps: 5_000,
  contractAddress: process.env.NEXT_PUBLIC_BID_CONTRACT_ADDRESS?.trim() || "",
  collateralSymbol: "USDG",
  collateralAddress:
    process.env.NEXT_PUBLIC_BID_COLLATERAL_ADDRESS?.trim() ||
    "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  marketFactoryAddress:
    process.env.NEXT_PUBLIC_BID_MARKET_FACTORY?.trim() || "",
  marketAddresses: {
    miamiTampa: process.env.NEXT_PUBLIC_BID_MARKET_MIA_TPA?.trim() || "",
    cityField: process.env.NEXT_PUBLIC_BID_MARKET_CITY_FIELD?.trim() || "",
    austinPositive: process.env.NEXT_PUBLIC_BID_MARKET_AUSTIN?.trim() || "",
  },
};
