export const siteConfig = {
  contractAddress: process.env.NEXT_PUBLIC_BID_CONTRACT_ADDRESS?.trim() || "",
  solanaCluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() || "mainnet-beta",
  solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "",
  marketProgramId: process.env.NEXT_PUBLIC_BID_MARKET_PROGRAM_ID?.trim() || "",
  usdcMint:
    process.env.NEXT_PUBLIC_USDC_MINT?.trim() ||
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};
