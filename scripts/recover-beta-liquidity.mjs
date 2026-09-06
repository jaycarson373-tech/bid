import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  isAddressEqual,
  parseAbi,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const EXPECTED_CHAIN_ID = 4663;
const DEPLOYMENT_BLOCK = 25_920_546n;
const MARKET = "0x99E8D451E0c936010f0F5d30A7f7b8e773BD8D5B";
const LIQUIDITY_VAULT = "0x0f45ea0d8F59BAd9203FD9e541645CAED048D215";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const EXPECTED_SEED = 25_000_000n;
const EXECUTION_ACK = "I_APPROVE_25_USDG_RECOVERY";

const execute = process.argv.slice(2).includes("--execute");
if (process.argv.slice(2).some((argument) => argument !== "--execute")) {
  console.error("Usage: npm run recover:beta:check or npm run recover:beta");
  process.exit(1);
}

const rpcUrl = process.env.RH_RPC_URL?.trim()
  || process.env.NEXT_PUBLIC_BID_RPC_URL?.trim()
  || "https://rpc.mainnet.chain.robinhood.com";

const marketAbi = parseAbi([
  "function collateral() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function quoteRemoveFundingToCollateral(uint256) view returns (uint256,uint256[])",
]);
const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function approvedMarkets(address) view returns (bool)",
  "function removeLiquidity(address,uint256,uint256) returns (uint256,uint256[])",
  "function recoverToken(address,address,uint256)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const tradeEvent = parseAbiItem(
  "event Trade(address indexed trader,bool indexed isBuy,uint256 indexed outcomeIndex,uint256 collateralAmount,uint256 outcomeTokenAmount,uint256 creatorFee)",
);
const limitOrderEvent = parseAbiItem(
  "event LimitOrderPlaced(uint256 indexed orderId,address indexed owner,uint8 kind,uint256 outcomeIndex,uint256 collateralAmount,uint256 outcomeTokenLimit)",
);

const publicClient = createPublicClient({
  transport: http(rpcUrl, { retryCount: 6, retryDelay: 750, timeout: 20_000 }),
});
let activeCheck = "startup";

async function checked(label, operation) {
  activeCheck = label;
  const result = await operation();
  await new Promise((resolve) => setTimeout(resolve, 180));
  return result;
}

function fail(message) {
  throw new Error(message);
}

async function readState() {
  // Keep reads sequential so the public RPC does not reject a burst of financial checks.
  const chainId = await checked("chain id", () => publicClient.getChainId());
  const marketCode = await checked("market bytecode", () => publicClient.getCode({ address: MARKET }));
  const vaultCode = await checked("vault bytecode", () => publicClient.getCode({ address: LIQUIDITY_VAULT }));
  const collateral = await checked("market collateral", () => publicClient.readContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "collateral",
  }));
  const owner = await checked("vault owner", () => publicClient.readContract({
    address: LIQUIDITY_VAULT,
    abi: vaultAbi,
    functionName: "owner",
  }));
  const approved = await checked("market approval", () => publicClient.readContract({
    address: LIQUIDITY_VAULT,
    abi: vaultAbi,
    functionName: "approvedMarkets",
    args: [MARKET],
  }));
  const vaultShares = await checked("vault LP shares", () => publicClient.readContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "balanceOf",
    args: [LIQUIDITY_VAULT],
  }));
  const totalShares = await checked("total LP supply", () => publicClient.readContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "totalSupply",
  }));
  const marketUsdg = await checked("market USDG", () => publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [MARKET],
  }));
  const vaultUsdg = await checked("vault USDG", () => publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [LIQUIDITY_VAULT],
  }));
  const ownerUsdg = await checked("owner USDG", () => publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  }));
  const ownerEth = await checked("owner ETH", () => publicClient.getBalance({ address: owner }));
  const trades = await checked("trade history", () => publicClient.getLogs({
    address: MARKET,
    event: tradeEvent,
    fromBlock: DEPLOYMENT_BLOCK,
  }));
  const limitOrders = await checked("limit-order history", () => publicClient.getLogs({
    address: MARKET,
    event: limitOrderEvent,
    fromBlock: DEPLOYMENT_BLOCK,
  }));

  if (chainId !== EXPECTED_CHAIN_ID) fail(`wrong chain ${chainId}; expected ${EXPECTED_CHAIN_ID}`);
  if (!marketCode || marketCode === "0x") fail("market bytecode missing");
  if (!vaultCode || vaultCode === "0x") fail("liquidity vault bytecode missing");
  if (!isAddressEqual(collateral, USDG)) fail("market collateral is not canonical USDG");
  if (!approved) fail("market is not approved by the liquidity vault");
  if (trades.length !== 0) fail(`market has ${trades.length} trade event(s); automatic full recovery is blocked`);
  if (limitOrders.length !== 0) fail(`market has ${limitOrders.length} limit order(s); automatic full recovery is blocked`);

  let quote = null;
  if (vaultShares > 0n) {
    if (vaultShares !== totalShares) fail("the liquidity vault does not own every outstanding LP share");
    quote = await checked("full recovery quote", () => publicClient.readContract({
      address: MARKET,
      abi: marketAbi,
      functionName: "quoteRemoveFundingToCollateral",
      args: [vaultShares],
    }));
    const [collateralOut, residualOutcomeTokens] = quote;
    if (collateralOut !== EXPECTED_SEED) fail(`recovery quote changed to ${formatUnits(collateralOut, 6)} USDG`);
    if (residualOutcomeTokens.some((amount) => amount !== 0n)) fail("recovery would leave residual outcome tokens");
    if (marketUsdg !== EXPECTED_SEED) fail(`market USDG balance changed to ${formatUnits(marketUsdg, 6)}`);
  } else if (totalShares !== 0n) {
    fail("vault LP shares are zero but another LP supply remains");
  }

  return {
    owner,
    vaultShares,
    totalShares,
    marketUsdg,
    vaultUsdg,
    ownerUsdg,
    ownerEth,
    quote,
  };
}

async function sendAndConfirm(walletClient, request, label) {
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`${label} reverted`);
  console.log(`PASS  ${label}: ${hash}`);
}

try {
  const before = await readState();
  console.log("BID beta liquidity recovery");
  console.log(`Mode: ${execute ? "EXECUTE" : "READ-ONLY CHECK"}`);
  console.log(`Vault owner/recipient: ${before.owner}`);
  console.log(`Vault LP shares: ${formatUnits(before.vaultShares, 6)} BID-LP`);
  console.log(`Market collateral: ${formatUnits(before.marketUsdg, 6)} USDG`);
  console.log(`Vault collateral: ${formatUnits(before.vaultUsdg, 6)} USDG`);
  console.log(`Owner wallet collateral: ${formatUnits(before.ownerUsdg, 6)} USDG`);
  console.log(`Owner wallet gas balance: ${formatEther(before.ownerEth)} ETH`);
  console.log(`Recovery quote: ${formatUnits(before.quote?.[0] ?? before.vaultUsdg, 6)} USDG`);
  console.log("PASS  chain, ownership, collateral, zero-trade, zero-limit-order and full-recovery checks");

  if (!execute) {
    console.log("SAFE STOP  no transaction submitted");
    process.exit(0);
  }

  if (process.env.BID_BETA_RECOVERY_ACK !== EXECUTION_ACK) {
    fail(`set BID_BETA_RECOVERY_ACK=${EXECUTION_ACK} for the one approved execution`);
  }
  const privateKey = process.env.LP_DEPLOYER_PRIVATE_KEY?.trim()
    || process.env.KEEPER_PRIVATE_KEY?.trim();
  if (!/^0x[0-9a-f]{64}$/i.test(privateKey || "")) fail("LP deployer private key is unavailable in the execution environment");
  const account = privateKeyToAccount(privateKey);
  if (!isAddressEqual(account.address, before.owner)) fail("configured signer is not the liquidity vault owner");
  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

  if (before.vaultShares > 0n) {
    const { request } = await publicClient.simulateContract({
      account,
      address: LIQUIDITY_VAULT,
      abi: vaultAbi,
      functionName: "removeLiquidity",
      args: [MARKET, before.vaultShares, before.quote[0]],
    });
    await sendAndConfirm(walletClient, request, "25 USDG liquidity removed to vault");
  }

  const amountToRecover = await publicClient.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [LIQUIDITY_VAULT],
  });
  if (amountToRecover > 0n) {
    const { request } = await publicClient.simulateContract({
      account,
      address: LIQUIDITY_VAULT,
      abi: vaultAbi,
      functionName: "recoverToken",
      args: [USDG, before.owner, amountToRecover],
    });
    await sendAndConfirm(walletClient, request, `${formatUnits(amountToRecover, 6)} USDG returned to owner wallet`);
  }

  const after = await readState();
  if (after.vaultShares !== 0n || after.totalShares !== 0n || after.marketUsdg !== 0n || after.vaultUsdg !== 0n) {
    fail("post-recovery balances are not zero; inspect receipts before any retry");
  }
  console.log("PASS  beta liquidity recovery complete");
} catch (error) {
  const message = typeof error === "object" && error !== null && "shortMessage" in error
    ? `RPC or contract call failed during ${activeCheck}; retry without changing recovery state`
    : error instanceof Error ? error.message : String(error);
  console.error(`FAIL  ${message}`);
  process.exit(1);
}
