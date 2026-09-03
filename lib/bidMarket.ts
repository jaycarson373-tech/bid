import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
} from "viem";
import { siteConfig } from "@/lib/site";

export const robinhoodChain = defineChain({
  id: siteConfig.robinhoodChainId,
  name: siteConfig.networkName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [siteConfig.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: siteConfig.explorerUrl },
  },
});

export const robinhoodPublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(siteConfig.rpcUrl),
});

export const bidMarketAbi = [
  {
    type: "function",
    name: "collateral",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "spotPricesBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "prices", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [
      { name: "collateralIn", type: "uint256" },
      { name: "outcomeIndex", type: "uint256" },
    ],
    outputs: [
      { name: "outcomeTokensOut", type: "uint256" },
      { name: "creatorFee", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralIn", type: "uint256" },
      { name: "outcomeIndex", type: "uint256" },
      { name: "minOutcomeTokensOut", type: "uint256" },
    ],
    outputs: [{ name: "outcomeTokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "placeBuyLimit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralIn", type: "uint256" },
      { name: "outcomeIndex", type: "uint256" },
      { name: "minOutcomeTokensOut", type: "uint256" },
    ],
    outputs: [{ name: "orderId", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteAddFunding",
    stateMutability: "view",
    inputs: [{ name: "collateralAmount", type: "uint256" }],
    outputs: [
      { name: "sharesMinted", type: "uint256" },
      { name: "outcomeTokensOut", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "addFunding",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralAmount", type: "uint256" },
      { name: "minSharesMinted", type: "uint256" },
    ],
    outputs: [{ name: "sharesMinted", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteRemoveFundingToCollateral",
    stateMutability: "view",
    inputs: [{ name: "sharesToBurn", type: "uint256" }],
    outputs: [
      { name: "collateralOut", type: "uint256" },
      { name: "residualOutcomeTokensOut", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "removeFundingToCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sharesToBurn", type: "uint256" },
      { name: "minCollateralOut", type: "uint256" },
    ],
    outputs: [
      { name: "collateralOut", type: "uint256" },
      { name: "residualOutcomeTokensOut", type: "uint256[]" },
    ],
  },
] as const;

export const erc20TradeAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

export function configuredAddress(value: string): Address | null {
  return isAddress(value) ? value : null;
}
