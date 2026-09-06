import {
  createPublicClient,
  formatEther,
  http,
  isAddressEqual,
  keccak256,
  parseAbi,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { bidFeePolicy } from "../config/bid-fee-policy.mjs";

const checks = [];
const failures = [];
const env = (key) => process.env[key]?.trim() ?? "";
const required = (key) => {
  const result = env(key);
  if (!result) throw new Error(`${key} is required`);
  return result;
};
const pass = (message) => checks.push(message);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  pass(message);
};
const sameAddress = (left, right) => isAddressEqual(left, right);

const requiredEnvironment = [
  "RH_RPC_URL",
  "NEXT_PUBLIC_BID_NETWORK",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CREATOR_TAX_BPS",
  "NEXT_PUBLIC_BID_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_BID_COLLATERAL_ADDRESS",
  "NEXT_PUBLIC_BID_MARKET_FACTORY",
  "NEXT_PUBLIC_BID_FLYWHEEL_TREASURY",
  "NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK",
  "NEXT_PUBLIC_BID_REWARDS_VAULT",
  "NEXT_PUBLIC_BID_LIQUIDITY_VAULT",
  "NEXT_PUBLIC_BID_BUYBACK_VAULT",
  "NEXT_PUBLIC_BID_PROTOCOL_TREASURY",
  "NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT",
  "NEXT_PUBLIC_BID_MAX_TRADE_AMOUNT",
  "NEXT_PUBLIC_PONS_FACTORY",
  "BID_RESOLUTION_ORACLE",
  "BID_COLLATERAL_TOKEN",
  "BID_TOKEN_ADDRESS",
  "BID_FLYWHEEL_TREASURY",
  "BID_MARKET_FACTORY",
  "BID_MAX_TRADE_AMOUNT",
  "BID_GENESIS_MARKET_COUNT",
  "BID_FACTORY_OWNER",
  "BID_TREASURY_OWNER",
  "BID_REWARDS_OWNER",
  "BID_BUYBACK_VAULT",
  "BID_PROTOCOL_TREASURY",
  "BID_CREATOR_REWARDS_VAULT",
  "BID_LIQUIDITY_OPERATOR",
  "BID_LIQUIDITY_VAULT_OWNER",
  "PONS_FEE_ESCROW",
  "PONS_FACTORY",
  "PONS_FEE_HOOK",
  "PONS_CURVE_ADDRESS",
  "PONS_QUOTE_ASSET",
];
const missingEnvironment = requiredEnvironment.filter((key) => !env(key));
if (missingEnvironment.length > 0) {
  for (const key of missingEnvironment) console.error(`FAIL  ${key} is required`);
  console.error(`\n0 passed, ${missingEnvironment.length} failed. Verification was read-only.`);
  process.exit(1);
}

const chainId = Number(env("BID_EXPECTED_CHAIN_ID") || "4663");
const rpcUrl = required("RH_RPC_URL");
const client = createPublicClient({ transport: http(rpcUrl) });

const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const factoryAbi = parseAbi([
  "function owner() view returns (address)",
  "function collateral() view returns (address)",
  "function bidToken() view returns (address)",
  "function resolutionOracle() view returns (address)",
  "function maxTradeAmount() view returns (uint256)",
  "function communityCreationEnabled() view returns (bool)",
  "function allMarkets() view returns (address[])",
  "function isBidMarket(address) view returns (bool)",
]);
const treasuryAbi = parseAbi([
  "function owner() view returns (address)",
  "function lpRewardsReserve() view returns (address)",
  "function liquidityVault() view returns (address)",
  "function buybackBurnReserve() view returns (address)",
  "function protocolTreasury() view returns (address)",
  "function creatorRewardsReserve() view returns (address)",
  "function ponsFeeEscrow() view returns (address)",
  "function ponsFeeHook() view returns (address)",
  "function ponsFactory() view returns (address)",
  "function ponsCurve() view returns (address)",
  "function ALLOCATION_VERSION() view returns (bytes32)",
  "function LP_REWARDS_BPS() view returns (uint256)",
  "function MARKET_LIQUIDITY_BPS() view returns (uint256)",
  "function BUYBACK_BURN_BPS() view returns (uint256)",
  "function TREASURY_BPS() view returns (uint256)",
  "function CREATOR_REWARDS_BPS() view returns (uint256)",
  "function BPS() view returns (uint256)",
]);
const liquidityVaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function collateral() view returns (address)",
  "function approvedMarkets(address) view returns (bool)",
]);
const rewardsDistributorAbi = parseAbi([
  "function owner() view returns (address)",
  "function totalOutstanding(address) view returns (uint256)",
]);
const marketAbi = parseAbi([
  "function factory() view returns (address)",
  "function collateral() view returns (address)",
  "function oracle() view returns (address)",
  "function creatorFeeBps() view returns (uint16)",
  "function maxTradeAmount() view returns (uint256)",
  "function closesAt() view returns (uint64)",
  "function resolved() view returns (bool)",
  "function question() view returns (string)",
  "function outcomeCount() view returns (uint256)",
  "function outcomeLabel(uint256) view returns (string)",
  "function poolBalances() view returns (uint256[])",
  "function spotPricesBps() view returns (uint256[])",
  "function quoteBuy(uint256,uint256) view returns (uint256,uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const ponsFactoryAbi = [{
  type: "function",
  name: "getLaunchedToken",
  stateMutability: "view",
  inputs: [{ name: "token", type: "address" }],
  outputs: [{
    name: "",
    type: "tuple",
    components: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
      { name: "deployer", type: "address" },
      { name: "creatorFeeRecipient", type: "address" },
      { name: "pairToken", type: "address" },
      { name: "graduationThreshold", type: "uint256" },
      { name: "poolFee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "creatorTaxBps", type: "uint16" },
      { name: "buybackEnabled", type: "bool" },
      { name: "phase", type: "uint8" },
      { name: "sweptQuote", type: "uint256" },
      { name: "sweptTokens", type: "uint256" },
      { name: "sweptAt", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  }],
}, {
  type: "function",
  name: "feeEscrow",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "address" }],
}, {
  type: "function",
  name: "memeHook",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "address" }],
}, {
  type: "function",
  name: "approvedPairTokens",
  stateMutability: "view",
  inputs: [{ name: "pairToken", type: "address" }],
  outputs: [{ name: "", type: "bool" }],
}];

const addresses = {
  token: required("NEXT_PUBLIC_BID_CONTRACT_ADDRESS"),
  collateral: required("NEXT_PUBLIC_BID_COLLATERAL_ADDRESS"),
  factory: required("NEXT_PUBLIC_BID_MARKET_FACTORY"),
  treasury: required("NEXT_PUBLIC_BID_FLYWHEEL_TREASURY"),
  rewardsVault: required("NEXT_PUBLIC_BID_REWARDS_VAULT"),
  liquidityVault: required("NEXT_PUBLIC_BID_LIQUIDITY_VAULT"),
  buybackVault: required("NEXT_PUBLIC_BID_BUYBACK_VAULT"),
  protocolTreasury: required("NEXT_PUBLIC_BID_PROTOCOL_TREASURY"),
  creatorRewardsVault: required("NEXT_PUBLIC_BID_CREATOR_REWARDS_VAULT"),
  oracle: required("BID_RESOLUTION_ORACLE"),
  factoryOwner: required("BID_FACTORY_OWNER"),
  treasuryOwner: required("BID_TREASURY_OWNER"),
  rewardsOwner: required("BID_REWARDS_OWNER"),
  liquidityOperator: required("BID_LIQUIDITY_OPERATOR"),
  liquidityVaultOwner: required("BID_LIQUIDITY_VAULT_OWNER"),
  ponsFactory: required("NEXT_PUBLIC_PONS_FACTORY"),
  ponsEscrow: required("PONS_FEE_ESCROW"),
  ponsFeeHook: required("PONS_FEE_HOOK"),
  ponsCurve: required("PONS_CURVE_ADDRESS"),
  ponsQuote: required("PONS_QUOTE_ASSET"),
};
const marketDefinitions = [];
if (env("NEXT_PUBLIC_BID_MARKET_MIA_TPA")) {
  marketDefinitions.push([env("NEXT_PUBLIC_BID_MARKET_MIA_TPA"), "Which city will post the larger home-price increase by year-end?", ["Miami", "Tampa"]]);
}
if (env("NEXT_PUBLIC_BID_MARKET_CITY_FIELD")) {
  marketDefinitions.push([env("NEXT_PUBLIC_BID_MARKET_CITY_FIELD"), "Which city posts the highest home-price growth from September 2026 to March 2027? Rules SHA-256: 7482dc1665a34149e76f5ee17e2ecdc3fb593b655130074b94e398f56bc59678", ["Miami", "Tampa", "New York", "Dallas", "Phoenix"]]);
}
if (env("NEXT_PUBLIC_BID_MARKET_AUSTIN")) {
  marketDefinitions.push([env("NEXT_PUBLIC_BID_MARKET_AUSTIN"), "Will Austin home prices finish 2026 positive year over year?", ["Yes", "No"]]);
}

async function hasCode(address, label) {
  const code = await client.getCode({ address });
  assert(Boolean(code && code !== "0x"), `${label} has deployed bytecode`);
}

async function run() {
  assert(env("NEXT_PUBLIC_BID_NETWORK") === "mainnet", "frontend network is Robinhood Chain mainnet");
  assert(chainId === 4663, "production expected chain ID is 4663");
  assert(env("PONS_PROTOCOL_VERSION") === "v2", "Pons protocol version is explicitly v2");
  assert(
    env("NEXT_PUBLIC_CREATOR_TAX_BPS") === String(bidFeePolicy.creatorFeeBps),
    "BID creator fee is fixed at 1.5%",
  );
  assert(BigInt(required("NEXT_PUBLIC_BID_DEPLOYMENT_BLOCK")) >= 0n, "flywheel deployment block is configured");
  assert(await client.getChainId() === chainId, `RPC is connected to expected chain ${chainId}`);
  assert(sameAddress(required("PONS_FACTORY"), addresses.ponsFactory), "deployment and frontend Pons factories match");
  assert(sameAddress(required("BID_COLLATERAL_TOKEN"), addresses.collateral), "deployment and frontend collateral match");
  assert(sameAddress(required("BID_TOKEN_ADDRESS"), addresses.token), "deployment BID token matches final CA");
  assert(sameAddress(required("BID_FLYWHEEL_TREASURY"), addresses.treasury), "deployment and frontend treasuries match");
  assert(sameAddress(required("BID_MARKET_FACTORY"), addresses.factory), "deployment and frontend market factories match");
  assert(sameAddress(required("BID_BUYBACK_VAULT"), addresses.buybackVault), "deployment and frontend buyback reserves match");
  assert(
    sameAddress(required("BID_PROTOCOL_TREASURY"), addresses.protocolTreasury),
    "deployment and frontend protocol treasuries match",
  );
  assert(
    sameAddress(required("BID_CREATOR_REWARDS_VAULT"), addresses.creatorRewardsVault),
    "deployment and frontend creator rewards reserves match",
  );

  await Promise.all([
    hasCode(addresses.token, "BID token"),
    hasCode(addresses.collateral, "collateral"),
    hasCode(addresses.factory, "market factory"),
    hasCode(addresses.treasury, "flywheel treasury"),
    hasCode(addresses.rewardsVault, "rewards distributor"),
    hasCode(addresses.liquidityVault, "liquidity vault"),
    hasCode(addresses.ponsFactory, "Pons factory"),
    hasCode(addresses.ponsEscrow, "Pons fee escrow"),
    hasCode(addresses.ponsFeeHook, "Pons fee hook"),
    hasCode(addresses.ponsCurve, "Pons curve"),
    ...marketDefinitions.map(([address], index) => hasCode(address, `genesis market ${index + 1}`)),
  ]);

  const [tokenName, symbol, decimals, supply] = await Promise.all([
    client.readContract({ address: addresses.token, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: addresses.token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: addresses.token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: addresses.token, abi: erc20Abi, functionName: "totalSupply" }),
  ]);
  assert(symbol === (env("BID_EXPECTED_TOKEN_SYMBOL") || "BID"), `token symbol is ${symbol}`);
  assert(decimals === Number(env("BID_EXPECTED_TOKEN_DECIMALS") || "18"), `token decimals are ${decimals}`);
  assert(supply > 0n, `${tokenName} has nonzero supply`);

  const [factoryOwner, factoryCollateral, factoryToken, factoryOracle, factoryMaxTrade, communityEnabled, allMarkets] = await Promise.all([
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "owner" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "collateral" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "bidToken" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "resolutionOracle" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "maxTradeAmount" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "communityCreationEnabled" }),
    client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "allMarkets" }),
  ]);
  assert(sameAddress(factoryOwner, addresses.factoryOwner), "factory owner matches production owner");
  assert(sameAddress(factoryCollateral, addresses.collateral), "factory collateral matches configured collateral");
  assert(sameAddress(factoryToken, addresses.token), "factory BID token matches final CA");
  assert(sameAddress(factoryOracle, addresses.oracle), "factory resolution oracle matches configuration");
  assert(factoryMaxTrade === BigInt(required("BID_MAX_TRADE_AMOUNT")), "factory enforces the configured beta order cap");
  assert(marketDefinitions.length === Number(required("BID_GENESIS_MARKET_COUNT")), "configured genesis market count matches public addresses");
  assert(communityEnabled === false, "community market creation remains disabled at launch");
  assert(allMarkets.length === marketDefinitions.length, "factory contains exactly the configured genesis markets");

  for (const [marketAddress, expectedQuestion, expectedOutcomes] of marketDefinitions) {
    const [marketFactory, collateral, oracle, feeBps, maxTradeAmount, closesAt, resolved, question, count, balances, prices, registered, vaultLpBalance] = await Promise.all([
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "factory" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "collateral" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "oracle" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "creatorFeeBps" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "maxTradeAmount" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "closesAt" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "resolved" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "question" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "outcomeCount" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "poolBalances" }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "spotPricesBps" }),
      client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "isBidMarket", args: [marketAddress] }),
      client.readContract({ address: marketAddress, abi: marketAbi, functionName: "balanceOf", args: [addresses.liquidityVault] }),
    ]);
    assert(sameAddress(marketFactory, addresses.factory), `${question}: factory is correct`);
    assert(sameAddress(collateral, addresses.collateral), `${question}: collateral is correct`);
    assert(sameAddress(oracle, addresses.oracle), `${question}: oracle is correct`);
    assert(feeBps === 0, `${question}: genesis trading fee is 0%`);
    assert(maxTradeAmount === BigInt(required("BID_MAX_TRADE_AMOUNT")), `${question}: beta order cap is enforced`);
    assert(Number(closesAt) > Math.floor(Date.now() / 1000), `${question}: close time is in the future`);
    assert(!resolved, `${question}: market is unresolved`);
    assert(question === expectedQuestion, `${question}: question matches release configuration`);
    assert(Number(count) === expectedOutcomes.length, `${question}: outcome count is correct`);
    assert(balances.every((balance) => balance > 0n), `${question}: liquidity is funded`);
    assert(prices.reduce((total, price) => total + price, 0n) === 10_000n, `${question}: prices normalize to 100%`);
    assert(registered, `${question}: factory registration is valid`);
    assert(vaultLpBalance > 0n, `${question}: genesis LP shares are owned by the liquidity vault`);
    const labels = await Promise.all(expectedOutcomes.map((_, index) => client.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: "outcomeLabel",
      args: [BigInt(index)],
    })));
    assert(labels.every((label, index) => label === expectedOutcomes[index]), `${question}: outcome labels match`);
    const quoteUnit = 10n ** BigInt(Number(env("BID_EXPECTED_COLLATERAL_DECIMALS") || "6"));
    const [quoted] = await client.readContract({ address: marketAddress, abi: marketAbi, functionName: "quoteBuy", args: [quoteUnit, 0n] });
    assert(quoted > 0n, `${question}: live buy quote succeeds`);
  }

  const [
    treasuryOwner,
    lpRewardsReserve,
    liquidityVault,
    buybackBurnReserve,
    protocolTreasury,
    creatorRewardsReserve,
    ponsEscrow,
    ponsFeeHook,
    treasuryPonsFactory,
    treasuryPonsCurve,
    allocationVersion,
    lpRewardsShare,
    marketLiquidityShare,
    buybackBurnShare,
    treasuryShare,
    creatorRewardsShare,
    basisPoints,
  ] = await Promise.all([
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "owner" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "lpRewardsReserve" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "liquidityVault" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "buybackBurnReserve" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "protocolTreasury" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "creatorRewardsReserve" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "ponsFeeEscrow" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "ponsFeeHook" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "ponsFactory" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "ponsCurve" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "ALLOCATION_VERSION" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "LP_REWARDS_BPS" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "MARKET_LIQUIDITY_BPS" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "BUYBACK_BURN_BPS" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "TREASURY_BPS" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "CREATOR_REWARDS_BPS" }),
    client.readContract({ address: addresses.treasury, abi: treasuryAbi, functionName: "BPS" }),
  ]);
  assert(sameAddress(treasuryOwner, addresses.treasuryOwner), "treasury owner matches production owner");
  assert(sameAddress(lpRewardsReserve, addresses.rewardsVault), "LP rewards reserve matches configuration");
  assert(sameAddress(liquidityVault, addresses.liquidityVault), "liquidity vault destination matches configuration");
  assert(sameAddress(buybackBurnReserve, addresses.buybackVault), "buyback and burn reserve matches configuration");
  assert(sameAddress(protocolTreasury, addresses.protocolTreasury), "protocol treasury matches configuration");
  assert(sameAddress(creatorRewardsReserve, addresses.creatorRewardsVault), "creator rewards reserve matches configuration");
  assert(sameAddress(ponsEscrow, addresses.ponsEscrow), "treasury is bound to the verified Pons escrow");
  assert(sameAddress(ponsFeeHook, addresses.ponsFeeHook), "treasury is bound to the verified Pons fee hook");
  assert(sameAddress(treasuryPonsFactory, addresses.ponsFactory), "treasury is bound to the verified Pons factory");
  assert(sameAddress(treasuryPonsCurve, addresses.ponsCurve), "treasury is bound to the BID Pons curve");
  assert(allocationVersion === keccak256(toBytes(bidFeePolicy.version)), "allocation policy version matches canonical configuration");
  const expectedAllocation = bidFeePolicy.allocations;
  assert(lpRewardsShare === BigInt(expectedAllocation.lpRewards), "LP rewards allocation is 45%");
  assert(marketLiquidityShare === BigInt(expectedAllocation.marketLiquidity), "market liquidity allocation is 30%");
  assert(buybackBurnShare === BigInt(expectedAllocation.buybackBurn), "buyback and burn allocation is 10%");
  assert(treasuryShare === BigInt(expectedAllocation.treasury), "protocol treasury allocation is 10%");
  assert(creatorRewardsShare === BigInt(expectedAllocation.creatorRewards), "creator rewards allocation is 5%");
  assert(
    lpRewardsShare + marketLiquidityShare + buybackBurnShare + treasuryShare + creatorRewardsShare
      === basisPoints,
    "treasury allocation sums to 100%",
  );

  const [rewardsOwner, rewardsOutstanding] = await Promise.all([
    client.readContract({ address: addresses.rewardsVault, abi: rewardsDistributorAbi, functionName: "owner" }),
    client.readContract({
      address: addresses.rewardsVault,
      abi: rewardsDistributorAbi,
      functionName: "totalOutstanding",
      args: [addresses.collateral],
    }),
  ]);
  assert(sameAddress(rewardsOwner, addresses.rewardsOwner), "rewards distributor owner matches production owner");
  pass(`rewards distributor reports ${rewardsOutstanding} collateral units committed to published epochs`);

  const [liquidityOwner, liquidityOperator, liquidityCollateral] = await Promise.all([
    client.readContract({ address: addresses.liquidityVault, abi: liquidityVaultAbi, functionName: "owner" }),
    client.readContract({ address: addresses.liquidityVault, abi: liquidityVaultAbi, functionName: "operator" }),
    client.readContract({ address: addresses.liquidityVault, abi: liquidityVaultAbi, functionName: "collateral" }),
  ]);
  assert(sameAddress(liquidityOwner, addresses.liquidityVaultOwner), "liquidity vault owner matches production owner");
  assert(sameAddress(liquidityOperator, addresses.liquidityOperator), "liquidity operator matches configuration");
  assert(sameAddress(liquidityCollateral, addresses.collateral), "liquidity vault collateral matches market collateral");
  for (const [marketAddress, question] of marketDefinitions) {
    const approved = await client.readContract({
      address: addresses.liquidityVault,
      abi: liquidityVaultAbi,
      functionName: "approvedMarkets",
      args: [marketAddress],
    });
    assert(approved, `${question}: market is approved by liquidity vault`);
  }

  const [launch, factoryEscrow, factoryHook, quoteAssetApproved] = await Promise.all([
    client.readContract({ address: addresses.ponsFactory, abi: ponsFactoryAbi, functionName: "getLaunchedToken", args: [addresses.token] }),
    client.readContract({ address: addresses.ponsFactory, abi: ponsFactoryAbi, functionName: "feeEscrow" }),
    client.readContract({ address: addresses.ponsFactory, abi: ponsFactoryAbi, functionName: "memeHook" }),
    client.readContract({
      address: addresses.ponsFactory,
      abi: ponsFactoryAbi,
      functionName: "approvedPairTokens",
      args: [addresses.ponsQuote],
    }),
  ]);
  assert(launch.exists, "Pons factory confirms the token launch exists");
  assert(sameAddress(launch.token, addresses.token), "Pons launch token matches final CA");
  assert(sameAddress(launch.curve, addresses.ponsCurve), "Pons launch curve matches configuration");
  assert(sameAddress(launch.creatorFeeRecipient, addresses.treasury), "Pons creator fees pay the flywheel treasury");
  assert(sameAddress(launch.pairToken, addresses.ponsQuote), "Pons quote asset matches configuration");
  assert(sameAddress(launch.pairToken, addresses.collateral), "Pons quote asset matches market collateral; no unimplemented swap is required");
  assert(launch.creatorTaxBps === bidFeePolicy.creatorFeeBps, "Pons launch BID creator fee is exactly 1.5%");
  assert(launch.buybackEnabled === false, "Pons buyback is disabled so creator fees remain available to the BID flywheel");
  assert(sameAddress(factoryEscrow, addresses.ponsEscrow), "Pons factory reports the configured fee escrow");
  assert(sameAddress(factoryHook, addresses.ponsFeeHook), "Pons factory reports the configured fee hook");
  assert(quoteAssetApproved, "Pons factory currently approves the configured USDG quote asset");

  if (env("KEEPER_EXECUTION_ENABLED") === "true") {
    const operatorKey = env("LP_DEPLOYER_PRIVATE_KEY") || required("KEEPER_PRIVATE_KEY");
    const account = privateKeyToAccount(operatorKey);
    assert(sameAddress(account.address, required("KEEPER_EXPECTED_ADDRESS")), "keeper key matches expected public address");
    assert(sameAddress(account.address, addresses.liquidityOperator), "keeper is the liquidity vault operator");
    const balance = await client.getBalance({ address: account.address });
    const minimum = BigInt(env("KEEPER_MIN_BALANCE_WEI") || "10000000000000000");
    assert(balance >= minimum, `keeper has at least ${formatEther(minimum)} ETH for gas`);
  }

  const siteUrl = required("NEXT_PUBLIC_SITE_URL");
  const html = await fetch(siteUrl).then((response) => {
    if (!response.ok) throw new Error(`frontend returned HTTP ${response.status}`);
    return response.text();
  });
  assert(html.includes(addresses.token), "production frontend contains the verified BID CA");
  const visibleText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  assert(!/(TEST_TOKEN|TESTNET_ADDRESS|\bundefined\b|\bnull\b|\bNaN\b)/.test(visibleText), "production frontend contains no forbidden visible placeholders");
}

try {
  await run();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

for (const check of checks) console.log(`PASS  ${check}`);
for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`\n${checks.length} passed, ${failures.length} failed. Verification was read-only.`);
if (failures.length > 0) process.exit(1);
