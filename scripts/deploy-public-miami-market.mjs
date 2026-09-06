import {
  createHash,
} from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  formatUnits,
  http,
  isAddressEqual,
  parseAbi,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAIN_ID = 4663;
const FACTORY = "0xD9da3C6F2272760a6AFcd6F2D95114231dF5D186";
const VAULT = "0x0f45ea0d8F59BAd9203FD9e541645CAED048D215";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const EXPECTED_SIGNER = "0xD935D28E466A3a95c4c4daA1421Fc8E1a5af24aD";
const PUBLIC_MARKET = "0xb5693d5C6c944Bea96c1c62B66c736D5C69AAd32";
const SEED = 25_000_000n;
const TRADE_CAP = 5_000_000n;
const CLOSES_AT = BigInt(Date.parse("2026-09-30T23:59:59Z") / 1_000);
const ACK = "I_APPROVE_25_USDG_MIAMI_MARKET";
const RULES = [
  "Market: Miami City Parcl Labs Sales Price Index direction.",
  "Source: Parcl Labs daily Sales Price Feed, Parcl ID 5352987.",
  "Baseline observation: 2026-09-06.",
  "Final observation: 2026-09-30.",
  "YES resolves at 1 USDG if the final index value is strictly greater than the baseline value.",
  "NO resolves at 1 USDG if the final index value is less than or equal to the baseline value.",
  "If an observation date is missing, use the latest Parcl value published on or before that date.",
  "Include revisions published by 2026-10-10 23:59:59 America/New_York, then resolve using the values available at that deadline.",
].join(" ");
const RULES_HASH = createHash("sha256").update(RULES).digest("hex");
const QUESTION = `Will Miami City's Parcl Labs home-price index rise by September 30, 2026? Rules SHA-256: ${RULES_HASH}`;

if (process.env.BID_PUBLIC_MARKET_ACK !== ACK) {
  throw new Error(`set BID_PUBLIC_MARKET_ACK=${ACK}`);
}
const privateKey = process.env.LP_DEPLOYER_PRIVATE_KEY?.trim();
if (!/^0x[0-9a-f]{64}$/i.test(privateKey || "")) throw new Error("LP_DEPLOYER_PRIVATE_KEY is unavailable");
const account = privateKeyToAccount(privateKey);
if (!isAddressEqual(account.address, EXPECTED_SIGNER)) throw new Error("configured signer mismatch");

const transport = http(process.env.RH_RPC_URL?.trim() || "https://rpc.mainnet.chain.robinhood.com", {
  retryCount: 6,
  retryDelay: 750,
  timeout: 20_000,
});
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const erc20Abi = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const factoryAbi = parseAbi([
  "function owner() view returns (address)",
  "function resolutionOracle() view returns (address)",
  "function collateral() view returns (address)",
  "function maxTradeAmount() view returns (uint256)",
  "function createProtocolGenesisMarket(string,string[],uint64,uint256,address) returns (address)",
]);
const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function collateral() view returns (address)",
  "function approvedMarkets(address) view returns (bool)",
  "function setMarketApproval(address,bool)",
]);
const marketAbi = parseAbi([
  "function collateral() view returns (address)",
  "function oracle() view returns (address)",
  "function question() view returns (string)",
  "function closesAt() view returns (uint64)",
  "function creatorFeeBps() view returns (uint16)",
  "function maxTradeAmount() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function spotPricesBps() view returns (uint256[])",
]);
const marketCreatedEvent = parseAbiItem(
  "event MarketCreated(address indexed market,address indexed creator,bool indexed communityCreated,uint256 initialLiquidity,uint16 creatorFeeBps)",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function simulateAndSend(label, parameters) {
  const { request } = await publicClient.simulateContract({ account, ...parameters });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert(receipt.status === "success", `${label} reverted`);
  console.log(`PASS  ${label}: ${hash}`);
  return receipt;
}

async function verifyPublicMarket(market) {
  const [marketCollateral, marketOracle, question, closesAt, fee, cap, lpShares, prices, approved, marketUsdg] =
    await Promise.all([
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "collateral" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "oracle" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "question" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "closesAt" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "creatorFeeBps" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "maxTradeAmount" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "balanceOf", args: [VAULT] }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "spotPricesBps" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "approvedMarkets", args: [market] }),
      publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [market] }),
    ]);
  assert(isAddressEqual(marketCollateral, USDG), "deployed market collateral mismatch");
  assert(isAddressEqual(marketOracle, account.address), "deployed market oracle mismatch");
  assert(question === QUESTION, "deployed market rules hash mismatch");
  assert(closesAt === CLOSES_AT, "deployed market close mismatch");
  assert(Number(fee) === 0 && cap === TRADE_CAP, "deployed market fee or cap mismatch");
  assert(lpShares === SEED && marketUsdg === SEED, "deployed market funding mismatch");
  assert(prices[0] === 5_000n && prices[1] === 5_000n, "deployed market quotes are not 50/50");
  assert(approved, "deployed market is not vault-approved");
  console.log(`MARKET ${market}`);
  console.log("PASS  public market verified: 25 USDG, YES 50.00%, NO 50.00%, 5 USDG cap");
}

async function main() {
  const latestBlock = await publicClient.getBlock();
  assert(await publicClient.getChainId() === CHAIN_ID, "wrong chain");
  assert(latestBlock.timestamp < CLOSES_AT, "public market close time is not in the future");

  const existingCode = await publicClient.getCode({ address: PUBLIC_MARKET });
  if (existingCode && existingCode !== "0x") {
    await verifyPublicMarket(PUBLIC_MARKET);
    console.log("PASS  existing public market found; no transaction submitted");
    return;
  }

  const [factoryOwner, oracle, collateral, maxTrade, vaultOwner, vaultCollateral, walletUsdg, walletEth] =
    await Promise.all([
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "owner" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "resolutionOracle" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "collateral" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "maxTradeAmount" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "owner" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "collateral" }),
      publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
      publicClient.getBalance({ address: account.address }),
    ]);
  assert(isAddressEqual(factoryOwner, account.address), "factory owner mismatch");
  assert(isAddressEqual(oracle, account.address), "resolution oracle mismatch");
  assert(isAddressEqual(collateral, USDG) && isAddressEqual(vaultCollateral, USDG), "USDG mismatch");
  assert(isAddressEqual(vaultOwner, account.address), "vault owner mismatch");
  assert(maxTrade === TRADE_CAP, "factory trade cap is not 5 USDG");
  assert(walletUsdg >= SEED, `wallet has ${formatUnits(walletUsdg, 6)} USDG, needs 25`);
  console.log(`PREFLIGHT ${formatUnits(walletUsdg, 6)} USDG, ${formatEther(walletEth)} ETH`);
  console.log(`RULES SHA-256 ${RULES_HASH}`);

  await simulateAndSend("factory approved for 25 USDG", {
    address: USDG,
    abi: erc20Abi,
    functionName: "approve",
    args: [FACTORY, SEED],
  });
  const receipt = await simulateAndSend("public Miami YES/NO market deployed and funded", {
    address: FACTORY,
    abi: factoryAbi,
    functionName: "createProtocolGenesisMarket",
    args: [QUESTION, ["YES", "NO"], CLOSES_AT, SEED, VAULT],
  });
  let market;
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, FACTORY)) continue;
    try {
      market = decodeEventLog({ abi: [marketCreatedEvent], data: log.data, topics: log.topics }).args.market;
      break;
    } catch {
      // Ignore unrelated factory logs.
    }
  }
  assert(market, "MarketCreated event missing");
  await simulateAndSend("public market approved by liquidity vault", {
    address: VAULT,
    abi: vaultAbi,
    functionName: "setMarketApproval",
    args: [market, true],
  });

  await verifyPublicMarket(market);
  console.log(`DEPLOYMENT_BLOCK ${receipt.blockNumber}`);
  console.log("PASS  BID ONE-MARKET DEPLOYMENT COMPLETE");
}

main().catch((error) => {
  console.error(`FAIL  ${error?.shortMessage || error?.message || String(error)}`);
  process.exit(1);
});
