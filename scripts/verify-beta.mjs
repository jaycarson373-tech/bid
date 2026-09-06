import { createPublicClient, http, isAddress, isAddressEqual, parseAbi } from "viem";

const env = key => process.env[key]?.trim() || "";
const abi = parseAbi([
  "function factory() view returns (address)",
  "function collateral() view returns (address)",
  "function oracle() view returns (address)",
  "function owner() view returns (address)",
  "function question() view returns (string)",
  "function outcomeCount() view returns (uint256)",
  "function outcomeLabel(uint256) view returns (string)",
  "function maxTradeAmount() view returns (uint256)",
  "function closesAt() view returns (uint64)",
  "function resolved() view returns (bool)",
  "function creatorFeeBps() view returns (uint16)",
  "function poolBalances() view returns (uint256[])",
  "function balanceOf(address) view returns (uint256)",
  "function isBidMarket(address) view returns (bool)",
  "function approvedMarkets(address) view returns (bool)",
  "function quoteBuy(uint256,uint256) view returns (uint256,uint256)",
]);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
};
try {
  const market = env("NEXT_PUBLIC_BID_MARKET_CITY_FIELD");
  const factory = env("NEXT_PUBLIC_BID_MARKET_FACTORY");
  const vault = env("NEXT_PUBLIC_BID_LIQUIDITY_VAULT");
  const oracle = env("BID_RESOLUTION_ORACLE");
  const vaultOwner = env("BID_LIQUIDITY_VAULT_OWNER");
  check([market, factory, vault, oracle, vaultOwner].every(value => isAddress(value)), "five-city market, factory, vault, oracle and vault owner public addresses configured");
  check(!env("NEXT_PUBLIC_BID_MARKET_MIA_TPA") && !env("NEXT_PUBLIC_BID_MARKET_AUSTIN"), "only the five-city beta is configured");
  const client = createPublicClient({ transport: http(env("RH_RPC_URL") || "https://rpc.mainnet.chain.robinhood.com") });
  check(await client.getChainId() === 4663, "Robinhood Chain mainnet 4663");
  for (const address of [market, factory, vault]) {
    const code = await client.getCode({ address });
    check(Boolean(code && code !== "0x"), `contract bytecode at ${address}`);
  }
  const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args });
  check(isAddressEqual(await read(market, "factory"), factory), "market belongs to configured factory");
  check(await read(factory, "isBidMarket", [market]), "factory registers beta market");
  check(isAddressEqual(await read(market, "collateral"), "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"), "market uses mainnet USDG");
  check(isAddressEqual(await read(market, "oracle"), oracle), "approved resolution oracle");
  check(isAddressEqual(await read(vault, "owner"), vaultOwner), "final liquidity vault owner");
  check(await read(vault, "approvedMarkets", [market]), "vault approves this market");
  check(await read(market, "balanceOf", [vault]) >= 25_000_000n, "protocol-owned seed LP shares present");
  check(await read(market, "maxTradeAmount") === 5_000_000n, "immutable 5 USDG order cap");
  check(Number(await read(market, "creatorFeeBps")) === 0, "zero prediction-market fee");
  const closesAt = await read(market, "closesAt");
  check(closesAt === 1804291199n && closesAt > BigInt(Math.floor(Date.now() / 1000)), "closes March 5, 2027 at 23:59:59 UTC");
  check(!await read(market, "resolved"), "market is not already resolved");
  check(await read(market, "question") === "Which city posts the highest home-price growth from September 2026 to March 2027? Rules SHA-256: 9e4e62ce9a6fd5330a5716ae0c101df4437a3ad00582de88cd72ffb914a3c406", "approved beta question and immutable rules hash");
  const cities = ["Miami", "Tampa", "New York", "Dallas", "Phoenix"];
  check(await read(market, "outcomeCount") === 5n, "exactly five city outcomes");
  for (const [index, city] of cities.entries()) {
    check(await read(market, "outcomeLabel", [BigInt(index)]) === city, `outcome ${index}: ${city}`);
    const [tokens, fee] = await read(market, "quoteBuy", [1_000_000n, BigInt(index)]);
    check(tokens > 0n && fee === 0n, `${city}: real USDG buy quote`);
  }
  check((await read(market, "poolBalances")).every(balance => balance > 0n), "all outcome reserves funded");
  console.log("PASS  beta onchain checks. Read-only: no trade or mainnet transaction submitted. Publish resolution rules and verify the deployed website before public orders.");
} catch (error) {
  // Do not print transport errors that might include a credentialed RPC URL.
  console.error(`FAIL  ${error?.shortMessage ? "RPC/contract verification failed; inspect your private operator logs" : error.message}`);
  process.exit(1);
}
