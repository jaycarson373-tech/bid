import { createServer } from "node:http";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddressEqual,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { bidFeePolicy } from "../config/bid-fee-policy.mjs";
import { buildLiquidityAllocationPlan } from "./liquidity-allocation.mjs";

const env = (key) => process.env[key]?.trim() ?? "";
const enabled = env("KEEPER_EXECUTION_ENABLED") === "true";
const chainId = Number(env("BID_EXPECTED_CHAIN_ID") || (env("NEXT_PUBLIC_BID_NETWORK") === "testnet" ? "46630" : "4663"));
const rpcUrl = env("RH_RPC_URL");
const pollInterval = Number(env("KEEPER_POLL_INTERVAL_MS") || "15000");
const maxOrderScan = Number(env("KEEPER_MAX_ORDER_SCAN") || "500");
const marketAddresses = (env("KEEPER_MARKETS") || [
  env("NEXT_PUBLIC_BID_MARKET_MIA_TPA"),
  env("NEXT_PUBLIC_BID_MARKET_CITY_FIELD"),
  env("NEXT_PUBLIC_BID_MARKET_AUSTIN"),
].filter(Boolean).join(",")).split(",").map((item) => item.trim()).filter(Boolean);
const treasury = env("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY");
const liquidityVault = env("NEXT_PUBLIC_BID_LIQUIDITY_VAULT");
const collateral = env("NEXT_PUBLIC_BID_COLLATERAL_ADDRESS") || env("BID_COLLATERAL_TOKEN");
const liquidityDeploymentEnabled = env("LP_DEPLOYMENT_ENABLED") === "true";
const minimumLiquidityDeployment = BigInt(env("LP_MIN_DEPLOY_AMOUNT") || "1000000");
const targetLiquidityDepth = BigInt(env("LP_TARGET_DEPTH") || "100000000");
const feeEscrow = env("PONS_FEE_ESCROW");
const feeHook = env("PONS_FEE_HOOK");
const ponsPoolId = env("PONS_POOL_ID");
const launchToken = env("NEXT_PUBLIC_BID_CONTRACT_ADDRESS");
const quoteAssets = (env("PONS_QUOTE_ASSETS") || env("PONS_QUOTE_ASSET"))
  .split(",").map((item) => item.trim()).filter((item) => item && !/^0x0{40}$/i.test(item));
const ponsCurve = env("PONS_CURVE_ADDRESS");

if (!rpcUrl) throw new Error("RH_RPC_URL is required");
if (!Number.isInteger(chainId) || chainId <= 0) throw new Error("BID_EXPECTED_CHAIN_ID is invalid");
if (!Number.isFinite(pollInterval) || pollInterval < 5_000) throw new Error("KEEPER_POLL_INTERVAL_MS must be at least 5000");
if (enabled && (!env("KEEPER_PRIVATE_KEY") || !env("KEEPER_EXPECTED_ADDRESS") || marketAddresses.length === 0)) {
  throw new Error("execution requires KEEPER_PRIVATE_KEY, KEEPER_EXPECTED_ADDRESS and at least one market");
}
if (liquidityDeploymentEnabled && (!enabled || !liquidityVault || !collateral)) {
  throw new Error("LP deployment requires execution, liquidity vault, and collateral addresses");
}
if (liquidityDeploymentEnabled && minimumLiquidityDeployment <= 0n) {
  throw new Error("LP_MIN_DEPLOY_AMOUNT must be greater than zero");
}
if (liquidityDeploymentEnabled && targetLiquidityDepth <= 0n) {
  throw new Error("LP_TARGET_DEPTH must be greater than zero");
}
if (env("PONS_CURVE_SWEEP_ENABLED") === "true" && (!enabled || !treasury || !ponsCurve)) {
  throw new Error("Pons curve sweep requires execution, treasury, and curve configuration");
}
if (env("PONS_HOOK_SWEEP_ENABLED") === "true") {
  if (!enabled || !treasury || !feeHook || !launchToken || quoteAssets.length === 0) {
    throw new Error("Pons hook sweep requires execution, treasury, hook, launch token, and quote asset configuration");
  }
  if (!/^0x[0-9a-f]{64}$/i.test(ponsPoolId)) throw new Error("PONS_POOL_ID must be a bytes32 value");
}

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const account = enabled ? privateKeyToAccount(env("KEEPER_PRIVATE_KEY")) : null;
const walletClient = account ? createWalletClient({ account, transport: http(rpcUrl) }) : null;
const marketAbi = parseAbi([
  "function nextLimitOrderId() view returns (uint256)",
  "function limitOrders(uint256) view returns (address owner,uint8 kind,uint256 outcomeIndex,uint256 collateralAmount,uint256 outcomeTokenLimit,bool active)",
  "function fillLimitOrder(uint256 orderId)",
  "function closesAt() view returns (uint64)",
  "function resolved() view returns (bool)",
  "function poolBalances() view returns (uint256[])",
  "function quoteAddFunding(uint256 collateralAmount) view returns (uint256 sharesMinted,uint256[] outcomeTokensOut)",
]);
const escrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient,address token) view returns (uint256)",
]);
const treasuryAbi = parseAbi([
  "function claimPonsNative() returns (uint256)",
  "function claimPonsToken(address token) returns (uint256)",
  "function claimAndDistributePonsNative() returns (uint256)",
  "function claimAndDistributePonsToken(address token) returns (uint256)",
  "function distributeNative()",
  "function distributeToken(address token)",
  "function sweepPonsCurveFees(uint256 minBuybackTokensOut)",
  "function sweepPonsPoolFees(bytes32 poolId,uint256 minConversionQuoteOut,uint256 minBuybackTokensOut)",
]);
const curveAbi = parseAbi([
  "function quoteFeeBalance() view returns (uint256)",
  "function creatorTaxBalance() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function sweepFees(uint256 minBuybackTokensOut)",
]);
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const liquidityVaultAbi = parseAbi([
  "function operator() view returns (address)",
  "function collateral() view returns (address)",
  "function approvedMarkets(address market) view returns (bool)",
  "function deployLiquidity(address market,uint256 collateralAmount,uint256 minSharesMinted) returns (uint256 sharesMinted)",
]);
const feeHookAbi = parseAbi([
  "function pendingCreatorTax(bytes32 poolId,address currency) view returns (uint256)",
]);

const status = {
  mode: enabled ? "execute" : "read-only",
  ready: false,
  running: false,
  chainId: null,
  keeper: account?.address ?? null,
  allocationVersion: bidFeePolicy.version,
  lastCycleStartedAt: null,
  lastCycleCompletedAt: null,
  lastError: null,
  lastTransaction: null,
};

function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

async function submit(request, action) {
  const hash = await walletClient.writeContract(request);
  status.lastTransaction = hash;
  log("transaction_submitted", { action, hash });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${action} reverted: ${hash}`);
  log("transaction_confirmed", { action, hash, blockNumber: receipt.blockNumber.toString() });
}

async function fillExecutableOrders() {
  for (const market of marketAddresses) {
    const nextId = await publicClient.readContract({ address: market, abi: marketAbi, functionName: "nextLimitOrderId" });
    if (nextId - 1n > BigInt(maxOrderScan)) {
      throw new Error(`${market} has more orders than KEEPER_MAX_ORDER_SCAN; deploy the event indexer before resuming`);
    }
    for (let orderId = 1n; orderId < nextId; orderId += 1n) {
      const order = await publicClient.readContract({ address: market, abi: marketAbi, functionName: "limitOrders", args: [orderId] });
      if (!order[5]) continue;
      let request;
      try {
        ({ request } = await publicClient.simulateContract({
          account,
          address: market,
          abi: marketAbi,
          functionName: "fillLimitOrder",
          args: [orderId],
        }));
      } catch {
        // Active but not currently marketable, closed, or concurrently filled.
        continue;
      }
      await submit(request, `fill_limit:${market}:${orderId}`);
    }
  }
}

async function sweepCurveFees() {
  if (env("PONS_CURVE_SWEEP_ENABLED") !== "true" || !ponsCurve) return;
  const [feeBalance, taxBalance, graduated] = await Promise.all([
    publicClient.readContract({ address: ponsCurve, abi: curveAbi, functionName: "quoteFeeBalance" }),
    publicClient.readContract({ address: ponsCurve, abi: curveAbi, functionName: "creatorTaxBalance" }),
    publicClient.readContract({ address: ponsCurve, abi: curveAbi, functionName: "graduated" }),
  ]);
  if (graduated || feeBalance + taxBalance === 0n) return;
  const { request } = await publicClient.simulateContract({
    account,
    address: treasury,
    abi: treasuryAbi,
    functionName: "sweepPonsCurveFees",
    args: [0n],
  });
  await submit(request, "sweep_pons_curve_fees");
}

async function claimAndDistributeFees() {
  if (!treasury || !feeEscrow) return;
  const nativeOwed = await publicClient.readContract({ address: feeEscrow, abi: escrowAbi, functionName: "balanceOf", args: [treasury] });
  if (nativeOwed > 0n) {
    const { request } = await publicClient.simulateContract({ account, address: treasury, abi: treasuryAbi, functionName: "claimAndDistributePonsNative" });
    await submit(request, "claim_and_allocate_pons_native");
  }
  const nativeBalance = await publicClient.getBalance({ address: treasury });
  if (nativeBalance > 0n) {
    const { request } = await publicClient.simulateContract({ account, address: treasury, abi: treasuryAbi, functionName: "distributeNative" });
    await submit(request, "distribute_native");
  }

  for (const token of quoteAssets) {
    const owed = await publicClient.readContract({ address: feeEscrow, abi: escrowAbi, functionName: "balanceOfToken", args: [treasury, token] });
    if (owed > 0n) {
      const { request } = await publicClient.simulateContract({ account, address: treasury, abi: treasuryAbi, functionName: "claimAndDistributePonsToken", args: [token] });
      await submit(request, `claim_and_allocate_pons_token:${token}`);
    }
    const balance = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [treasury] });
    if (balance > 0n) {
      const { request } = await publicClient.simulateContract({ account, address: treasury, abi: treasuryAbi, functionName: "distributeToken", args: [token] });
      await submit(request, `distribute_token:${token}`);
    }
  }
}

async function sweepHookFees() {
  if (env("PONS_HOOK_SWEEP_ENABLED") !== "true") return;
  const currencies = [...new Set([launchToken, ...quoteAssets].map((address) => address.toLowerCase()))];
  const pending = await Promise.all(currencies.map((currency) => publicClient.readContract({
    address: feeHook,
    abi: feeHookAbi,
    functionName: "pendingCreatorTax",
    args: [ponsPoolId, currency],
  })));
  if (pending.every((amount) => amount === 0n)) return;
  const { request } = await publicClient.simulateContract({
    account,
    address: treasury,
    abi: treasuryAbi,
    functionName: "sweepPonsPoolFees",
    args: [ponsPoolId, BigInt(env("PONS_MIN_CONVERSION_QUOTE_OUT") || "0"), 0n],
  });
  await submit(request, "sweep_pons_pool_fees");
}

async function deployProtocolLiquidity() {
  if (!liquidityDeploymentEnabled) return;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const eligibleMarkets = [];
  for (const market of marketAddresses) {
    const [closesAt, resolved, balances] = await Promise.all([
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "closesAt" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "resolved" }),
      publicClient.readContract({ address: market, abi: marketAbi, functionName: "poolBalances" }),
    ]);
    if (!resolved && closesAt > now && balances.length > 0) {
      eligibleMarkets.push({
        address: market,
        currentDepth: balances.reduce((minimum, balance) => balance < minimum ? balance : minimum),
      });
    }
  }
  if (eligibleMarkets.length === 0) return;

  const available = await publicClient.readContract({
    address: collateral,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [liquidityVault],
  });
  const plan = buildLiquidityAllocationPlan(
    eligibleMarkets,
    available,
    targetLiquidityDepth,
    minimumLiquidityDeployment,
  );

  for (const { address: market, amount } of plan) {
    const [quotedShares] = await publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "quoteAddFunding",
      args: [amount],
    });
    const minimumShares = quotedShares * 9_950n / 10_000n;
    const { request } = await publicClient.simulateContract({
      account,
      address: liquidityVault,
      abi: liquidityVaultAbi,
      functionName: "deployLiquidity",
      args: [market, amount, minimumShares],
    });
    await submit(request, `deploy_liquidity:${market}`);
  }
}

async function cycle() {
  if (status.running || !enabled) return;
  status.running = true;
  status.lastCycleStartedAt = new Date().toISOString();
  status.lastError = null;
  try {
    await fillExecutableOrders();
    await sweepCurveFees();
    await sweepHookFees();
    await claimAndDistributeFees();
    await deployProtocolLiquidity();
    status.lastCycleCompletedAt = new Date().toISOString();
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
    log("cycle_failed", { error: status.lastError });
  } finally {
    status.running = false;
  }
}

const actualChainId = await publicClient.getChainId();
if (actualChainId !== chainId) throw new Error(`RPC chain ${actualChainId} does not match expected chain ${chainId}`);
for (const [label, address] of [
  ...marketAddresses.map((address, index) => [`market_${index + 1}`, address]),
  ...(treasury ? [["treasury", treasury]] : []),
  ...(liquidityVault ? [["liquidity_vault", liquidityVault]] : []),
  ...(collateral ? [["collateral", collateral]] : []),
  ...(feeEscrow ? [["pons_fee_escrow", feeEscrow]] : []),
  ...(feeHook ? [["pons_fee_hook", feeHook]] : []),
  ...(ponsCurve ? [["pons_curve", ponsCurve]] : []),
]) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no deployed bytecode`);
}
if (account && env("KEEPER_EXPECTED_ADDRESS") && !isAddressEqual(account.address, env("KEEPER_EXPECTED_ADDRESS"))) {
  throw new Error("keeper key does not match KEEPER_EXPECTED_ADDRESS");
}
if (account) {
  const minimumBalance = BigInt(env("KEEPER_MIN_BALANCE_WEI") || "10000000000000000");
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < minimumBalance) throw new Error("keeper signer has insufficient gas balance");
}
if (liquidityDeploymentEnabled) {
  const [operator, vaultCollateral, approvals] = await Promise.all([
    publicClient.readContract({ address: liquidityVault, abi: liquidityVaultAbi, functionName: "operator" }),
    publicClient.readContract({ address: liquidityVault, abi: liquidityVaultAbi, functionName: "collateral" }),
    Promise.all(marketAddresses.map((market) => publicClient.readContract({
      address: liquidityVault,
      abi: liquidityVaultAbi,
      functionName: "approvedMarkets",
      args: [market],
    }))),
  ]);
  if (!isAddressEqual(operator, account.address)) throw new Error("keeper is not the liquidity vault operator");
  if (!isAddressEqual(vaultCollateral, collateral)) throw new Error("liquidity vault collateral mismatch");
  if (approvals.some((approved) => !approved)) throw new Error("one or more keeper markets are not approved by the liquidity vault");
}
status.chainId = actualChainId;
status.ready = true;
log("keeper_ready", { mode: status.mode, chainId: actualChainId, markets: marketAddresses.length, keeper: status.keeper });

const server = createServer((request, response) => {
  const healthy = status.ready && !status.lastError;
  response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
  response.end(JSON.stringify({ ...status, privateKeyConfigured: Boolean(env("KEEPER_PRIVATE_KEY")) }));
});
server.listen(Number(env("PORT") || "8080"), "0.0.0.0");

if (enabled) {
  void cycle();
  setInterval(() => void cycle(), pollInterval);
}
