import {
  createPublicClient,
  formatEther,
  formatGwei,
  formatUnits,
  http,
  isAddress,
  isAddressEqual,
  parseAbi,
} from "viem";

const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const DEFAULT_PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const EXPECTED_CHAIN_ID = Number(process.env.BID_EXPECTED_CHAIN_ID || "4663");
const rpcUrl = process.env.RH_RPC_URL?.trim()
  || process.env.NEXT_PUBLIC_BID_RPC_URL?.trim()
  || DEFAULT_RPC_URL;
const ponsFactory = process.env.PONS_FACTORY?.trim()
  || process.env.NEXT_PUBLIC_PONS_FACTORY?.trim()
  || DEFAULT_PONS_FACTORY;
const pairToken = process.env.PONS_QUOTE_ASSET?.trim()
  || process.env.BID_COLLATERAL_TOKEN?.trim()
  || process.env.NEXT_PUBLIC_BID_COLLATERAL_ADDRESS?.trim()
  || "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const expectedEscrow = process.env.PONS_FEE_ESCROW?.trim()
  || "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";
const expectedHook = process.env.PONS_FEE_HOOK?.trim()
  || "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
const deployer = process.env.BID_DEPLOYER?.trim();
const launchConfigId = BigInt(process.env.PONS_LAUNCH_CONFIG_ID || "0");

if (![ponsFactory, pairToken, expectedEscrow, expectedHook].every(isAddress)) {
  console.error("FAIL  Pons factory, pair token, escrow, and hook must be valid EVM addresses");
  process.exit(1);
}
if (deployer && !isAddress(deployer)) {
  console.error("FAIL  BID_DEPLOYER must be a valid EVM address");
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpcUrl) });
const ponsFactoryAbi = parseAbi([
  "function launchFee() view returns (uint256)",
  "function approvedPairTokens(address) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint16)",
  "function feeEscrow() view returns (address)",
  "function memeHook() view returns (address)",
  "function canLaunch(address) view returns (bool)",
  "function previewLaunchEconomics(uint256,address) view returns (bytes32)",
]);

try {
  const [chainId, blockNumber, gasPrice, bytecode, launchFee, pairApproved, maxTax, escrow, hook, economics] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
    client.getBytecode({ address: ponsFactory }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "launchFee" }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "approvedPairTokens", args: [pairToken] }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "maxCreatorTaxBps" }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "feeEscrow" }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "memeHook" }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "previewLaunchEconomics", args: [launchConfigId, pairToken] }),
  ]);

  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`RPC returned chain ${chainId}; expected ${EXPECTED_CHAIN_ID}`);
  }
  if (!bytecode || bytecode === "0x") {
    throw new Error(`no contract bytecode at Pons factory ${ponsFactory}`);
  }
  if (!pairApproved) throw new Error(`Pons factory has not approved pair token ${pairToken}`);
  if (maxTax < 250) throw new Error(`Pons creator-tax cap is ${maxTax} bps; BID requires 250 bps`);
  if (!isAddressEqual(escrow, expectedEscrow)) throw new Error(`Pons escrow mismatch: factory returned ${escrow}`);
  if (!isAddressEqual(hook, expectedHook)) throw new Error(`Pons hook mismatch: factory returned ${hook}`);

  const canLaunch = deployer
    ? await client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "canLaunch", args: [deployer] })
    : null;
  if (canLaunch === false) throw new Error(`Pons factory currently rejects BID_DEPLOYER ${deployer}`);

  const keeperReserve = BigInt(process.env.KEEPER_MIN_BALANCE_WEI || "10000000000000000");
  const configuredPerMarket = process.env.BID_INITIAL_LIQUIDITY?.trim();
  const collateralDecimals = Number(process.env.BID_EXPECTED_COLLATERAL_DECIMALS || "6");
  const sampleGasUnits = [100_000n, 500_000n, 1_000_000n];

  console.log("BID production cost snapshot (read-only)");
  console.log(`Network: Robinhood Chain mainnet (${chainId})`);
  console.log(`Block: ${blockNumber}`);
  console.log(`Pons factory: ${ponsFactory}`);
  console.log(`Pons pair token approved: ${pairToken}`);
  console.log(`Pons fee escrow verified: ${escrow}`);
  console.log(`Pons fee hook verified: ${hook}`);
  console.log(`Pons launch economics (config ${launchConfigId}): ${economics}`);
  console.log(`BID 2.5% creator tax allowed: yes (factory cap ${maxTax} bps)`);
  console.log(`Deployer eligible now: ${canLaunch === null ? "pending BID_DEPLOYER" : "yes"}`);
  console.log(`Pons launch fee now: ${formatEther(launchFee)} ETH`);
  console.log(`Gas price now: ${formatGwei(gasPrice)} gwei`);
  console.log("Illustrative gas at this price:");
  for (const gasUnits of sampleGasUnits) {
    console.log(`  ${gasUnits.toLocaleString("en-US")} gas = ${formatEther(gasUnits * gasPrice)} ETH`);
  }
  console.log(`Keeper minimum configured reserve: ${formatEther(keeperReserve)} ETH`);
  console.log("Genesis liquidity capital (not a fee):");
  console.log("  Lean: 30,000 USDG total (10,000 per market)");
  console.log("  Recommended: 75,000 USDG total (25,000 per market)");
  if (configuredPerMarket) {
    const perMarket = BigInt(configuredPerMarket);
    console.log(`  Configured: ${formatUnits(perMarket * 3n, collateralDecimals)} USDG total (${formatUnits(perMarket, collateralDecimals)} per market)`);
  }
  console.log("Deployment gas is finalized only after the public owner/operator addresses and final BID CA are bound.");
  console.log("PASS  live fee and gas data loaded; no transaction was submitted");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL  unable to load production costs: ${message}`);
  process.exit(1);
}
