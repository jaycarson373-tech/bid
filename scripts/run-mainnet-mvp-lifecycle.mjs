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
const SEED = 20_000_000n;
const TRADE = 5_000_000n;
const PAYOUT_SCALE = 10n ** 18n;
const CLOSE_DELAY_SECONDS = 75n;
const ACK = "I_APPROVE_BID_MVP_LIFECYCLE";

if (process.env.BID_MVP_LIFECYCLE_ACK !== ACK) {
  throw new Error(`set BID_MVP_LIFECYCLE_ACK=${ACK}`);
}

const privateKey = process.env.LP_DEPLOYER_PRIVATE_KEY?.trim();
if (!/^0x[0-9a-f]{64}$/i.test(privateKey || "")) {
  throw new Error("LP_DEPLOYER_PRIVATE_KEY is unavailable");
}

const account = privateKeyToAccount(privateKey);
if (!isAddressEqual(account.address, EXPECTED_SIGNER)) {
  throw new Error("configured signer is not the expected factory and vault owner");
}

const rpcUrl = process.env.RH_RPC_URL?.trim() || "https://rpc.mainnet.chain.robinhood.com";
const transport = http(rpcUrl, { retryCount: 6, retryDelay: 750, timeout: 20_000 });
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
  "function operator() view returns (address)",
  "function collateral() view returns (address)",
  "function setMarketApproval(address,bool)",
  "function removeLiquidity(address,uint256,uint256) returns (uint256,uint256[])",
  "function recoverToken(address,address,uint256)",
]);
const marketAbi = parseAbi([
  "function collateral() view returns (address)",
  "function oracle() view returns (address)",
  "function closesAt() view returns (uint64)",
  "function creatorFeeBps() view returns (uint16)",
  "function maxTradeAmount() view returns (uint256)",
  "function resolved() view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function spotPricesBps() view returns (uint256[])",
  "function outcomeBalanceOf(address,uint256) view returns (uint256)",
  "function quoteBuy(uint256,uint256) view returns (uint256,uint256)",
  "function buy(uint256,uint256,uint256) returns (uint256)",
  "function resolve(uint256[])",
  "function redeem() returns (uint256)",
  "function quoteRemoveFundingToCollateral(uint256) view returns (uint256,uint256[])",
]);
const marketCreatedEvent = parseAbiItem(
  "event MarketCreated(address indexed market,address indexed creator,bool indexed communityCreated,uint256 initialLiquidity,uint16 creatorFeeBps)",
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function send(label, request) {
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert(receipt.status === "success", `${label} reverted`);
  console.log(`PASS  ${label}: ${hash}`);
  return receipt;
}

async function simulateAndSend(label, parameters) {
  const { request } = await publicClient.simulateContract({ account, ...parameters });
  return send(label, request);
}

async function main() {
  const chainId = await publicClient.getChainId();
  assert(chainId === CHAIN_ID, `wrong chain ${chainId}`);

  const [factoryOwner, oracle, factoryCollateral, maxTrade, vaultOwner, vaultOperator, vaultCollateral] =
    await Promise.all([
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "owner" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "resolutionOracle" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "collateral" }),
      publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "maxTradeAmount" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "owner" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "operator" }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "collateral" }),
    ]);
  for (const [label, value, expected] of [
    ["factory owner", factoryOwner, account.address],
    ["resolution oracle", oracle, account.address],
    ["factory collateral", factoryCollateral, USDG],
    ["vault owner", vaultOwner, account.address],
    ["vault operator", vaultOperator, account.address],
    ["vault collateral", vaultCollateral, USDG],
  ]) {
    assert(isAddressEqual(value, expected), `${label} mismatch`);
  }
  assert(maxTrade === TRADE, `factory max trade is ${formatUnits(maxTrade, 6)} USDG, expected 5`);

  const startingUsdg = await publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const startingEth = await publicClient.getBalance({ address: account.address });
  assert(startingUsdg >= SEED + TRADE, "wallet needs at least 25 USDG");
  console.log(`START wallet: ${formatUnits(startingUsdg, 6)} USDG, ${formatEther(startingEth)} ETH`);

  await simulateAndSend("factory approved for 20 USDG", {
    address: USDG,
    abi: erc20Abi,
    functionName: "approve",
    args: [FACTORY, SEED],
  });

  const latestBlock = await publicClient.getBlock();
  const closesAt = latestBlock.timestamp + CLOSE_DELAY_SECONDS;
  const createReceipt = await simulateAndSend("private binary test market deployed and funded with 20 USDG", {
    address: FACTORY,
    abi: factoryAbi,
    functionName: "createProtocolGenesisMarket",
    args: [
      "INTERNAL BID MVP LIFECYCLE TEST - NOT A PUBLIC HOUSING MARKET",
      ["YES", "NO"],
      closesAt,
      SEED,
      VAULT,
    ],
  });

  let market;
  for (const log of createReceipt.logs) {
    if (!isAddressEqual(log.address, FACTORY)) continue;
    try {
      const decoded = decodeEventLog({ abi: [marketCreatedEvent], data: log.data, topics: log.topics });
      market = decoded.args.market;
      break;
    } catch {
      // Ignore unrelated factory logs.
    }
  }
  assert(market, "MarketCreated event missing");
  console.log(`TEST MARKET ${market}`);

  const [marketCollateral, marketOracle, marketClose, creatorFee, marketCap, initialPrices, initialLp] =
    await Promise.all([
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "collateral" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "oracle" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "closesAt" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "creatorFeeBps" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "maxTradeAmount" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "spotPricesBps" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "balanceOf", args: [VAULT] }),
    ]);
  assert(isAddressEqual(marketCollateral, USDG), "test market collateral mismatch");
  assert(isAddressEqual(marketOracle, account.address), "test market oracle mismatch");
  assert(marketClose === closesAt, "test market close mismatch");
  assert(creatorFee === 0, "test market fee is not zero");
  assert(marketCap === TRADE, "test market cap is not 5 USDG");
  assert(initialPrices[0] === 5_000n && initialPrices[1] === 5_000n, "initial quotes are not 50/50");
  assert(initialLp === SEED, "vault did not receive every LP share");
  console.log("PASS  real initial quotes: YES 50.00%, NO 50.00%");

  await simulateAndSend("test market approved by liquidity vault", {
    address: VAULT,
    abi: vaultAbi,
    functionName: "setMarketApproval",
    args: [market, true],
  });
  await simulateAndSend("test market approved for 5 USDG trade", {
    address: USDG,
    abi: erc20Abi,
    functionName: "approve",
    args: [market, TRADE],
  });

  const [quotedTokens, quotedFee] = await publicClient.readContract({
    address: market,
    abi: marketAbi,
    functionName: "quoteBuy",
    args: [TRADE, 0n],
  });
  assert(quotedTokens > TRADE, "5 USDG quote did not return the expected YES position");
  assert(quotedFee === 0n, "test trade unexpectedly charges a creator fee");
  await simulateAndSend("real 5 USDG YES trade", {
    address: market,
    abi: marketAbi,
    functionName: "buy",
    args: [TRADE, 0n, quotedTokens],
  });

  const [position, movedPrices] = await Promise.all([
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "outcomeBalanceOf", args: [account.address, 0n] }),
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "spotPricesBps" }),
  ]);
  assert(position === quotedTokens, "position does not equal confirmed trade output");
  assert(movedPrices[0] > 5_000n && movedPrices[0] + movedPrices[1] === 10_000n, "quotes did not update after trade");
  console.log(`PASS  position accounting: ${formatUnits(position, 6)} YES`);
  console.log(`PASS  moved quotes: YES ${Number(movedPrices[0]) / 100}%, NO ${Number(movedPrices[1]) / 100}%`);

  while (true) {
    const block = await publicClient.getBlock();
    if (block.timestamp >= closesAt) break;
    await sleep(2_000);
  }
  console.log(`PASS  market closed automatically at ${closesAt}`);

  await simulateAndSend("test market resolved YES", {
    address: market,
    abi: marketAbi,
    functionName: "resolve",
    args: [[PAYOUT_SCALE, 0n]],
  });
  assert(await publicClient.readContract({ address: market, abi: marketAbi, functionName: "resolved" }), "resolution flag missing");

  const beforeRedeem = await publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  await simulateAndSend("winning YES position redeemed", {
    address: market,
    abi: marketAbi,
    functionName: "redeem",
  });
  const afterRedeem = await publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  assert(afterRedeem - beforeRedeem === position, "redeemed USDG does not equal winning position");

  const lpShares = await publicClient.readContract({
    address: market,
    abi: marketAbi,
    functionName: "balanceOf",
    args: [VAULT],
  });
  const [lpCollateral] = await publicClient.readContract({
    address: market,
    abi: marketAbi,
    functionName: "quoteRemoveFundingToCollateral",
    args: [lpShares],
  });
  await simulateAndSend("remaining test liquidity removed", {
    address: VAULT,
    abi: vaultAbi,
    functionName: "removeLiquidity",
    args: [market, lpShares, lpCollateral],
  });
  const vaultUsdg = await publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [VAULT],
  });
  await simulateAndSend("remaining test USDG returned to owner", {
    address: VAULT,
    abi: vaultAbi,
    functionName: "recoverToken",
    args: [USDG, account.address, vaultUsdg],
  });

  const [finalUsdg, finalEth, finalPosition, finalMarketUsdg, finalVaultUsdg, finalLpSupply] = await Promise.all([
    publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "outcomeBalanceOf", args: [account.address, 0n] }),
    publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [market] }),
    publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [VAULT] }),
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "totalSupply" }),
  ]);
  assert(finalUsdg === startingUsdg, "wallet USDG did not reconcile to the starting balance");
  assert(finalPosition === 0n, "winning test position was not cleared");
  assert(finalMarketUsdg === 0n && finalVaultUsdg === 0n && finalLpSupply === 0n, "temporary market cleanup incomplete");
  console.log(`PASS  USDG reconciled: ${formatUnits(finalUsdg, 6)} USDG`);
  console.log(`GAS   ${formatEther(startingEth - finalEth)} ETH`);
  console.log("PASS  BID MVP MAINNET LIFECYCLE COMPLETE");
}

main().catch((error) => {
  console.error(`FAIL  ${error?.shortMessage || error?.message || String(error)}`);
  process.exit(1);
});
