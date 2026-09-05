import {
  createPublicClient,
  formatEther,
  formatGwei,
  formatUnits,
  http,
  isAddress,
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

if (!isAddress(ponsFactory)) {
  console.error("FAIL  PONS_FACTORY must be a valid EVM address");
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpcUrl) });
const ponsFactoryAbi = parseAbi(["function launchFee() view returns (uint256)"]);

try {
  const [chainId, blockNumber, gasPrice, bytecode, launchFee] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
    client.getBytecode({ address: ponsFactory }),
    client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "launchFee" }),
  ]);

  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`RPC returned chain ${chainId}; expected ${EXPECTED_CHAIN_ID}`);
  }
  if (!bytecode || bytecode === "0x") {
    throw new Error(`no contract bytecode at Pons factory ${ponsFactory}`);
  }

  const keeperReserve = BigInt(process.env.KEEPER_MIN_BALANCE_WEI || "10000000000000000");
  const configuredPerMarket = process.env.BID_INITIAL_LIQUIDITY?.trim();
  const collateralDecimals = Number(process.env.BID_EXPECTED_COLLATERAL_DECIMALS || "6");
  const sampleGasUnits = [100_000n, 500_000n, 1_000_000n];

  console.log("BID production cost snapshot (read-only)");
  console.log(`Network: Robinhood Chain mainnet (${chainId})`);
  console.log(`Block: ${blockNumber}`);
  console.log(`Pons factory: ${ponsFactory}`);
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
