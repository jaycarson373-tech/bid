import { isAddress } from "viem";

const PLACEHOLDER = /(<[^>]+>|\b(?:undefined|null|nan|test_token|testnet_address)\b|required|printed|your-project)/i;
const ADDRESS_KEYS = [
  "NEXT_PUBLIC_PONS_FACTORY",
  "NEXT_PUBLIC_BID_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_BID_COLLATERAL_ADDRESS",
  "NEXT_PUBLIC_BID_MARKET_FACTORY",
  "NEXT_PUBLIC_BID_FLYWHEEL_TREASURY",
  "NEXT_PUBLIC_BID_REWARDS_VAULT",
  "NEXT_PUBLIC_BID_LIQUIDITY_VAULT",
  "NEXT_PUBLIC_BID_RESERVE_VAULT",
  "NEXT_PUBLIC_BID_MARKET_MIA_TPA",
  "NEXT_PUBLIC_BID_MARKET_CITY_FIELD",
  "NEXT_PUBLIC_BID_MARKET_AUSTIN",
  "PONS_FEE_ESCROW",
  "PONS_FACTORY",
  "PONS_CURVE_ADDRESS",
  "PONS_FEE_HOOK",
  "PONS_QUOTE_ASSET",
  "BID_RESOLUTION_ORACLE",
  "BID_COLLATERAL_TOKEN",
  "BID_TOKEN_ADDRESS",
  "BID_FLYWHEEL_TREASURY",
  "BID_MARKET_FACTORY",
  "BID_DEPLOYER",
  "BID_FACTORY_OWNER",
  "BID_TREASURY_OWNER",
  "BID_REWARDS_VAULT",
  "BID_RESERVE_VAULT",
  "BID_LIQUIDITY_VAULT",
  "BID_LIQUIDITY_OPERATOR",
  "BID_LIQUIDITY_VAULT_OWNER",
  "KEEPER_EXPECTED_ADDRESS",
];

const LIVE_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_PONS_FACTORY",
  "NEXT_PUBLIC_BID_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_BID_COLLATERAL_ADDRESS",
  "NEXT_PUBLIC_BID_MARKET_FACTORY",
  "NEXT_PUBLIC_BID_FLYWHEEL_TREASURY",
  "NEXT_PUBLIC_BID_REWARDS_VAULT",
  "NEXT_PUBLIC_BID_LIQUIDITY_VAULT",
  "NEXT_PUBLIC_BID_RESERVE_VAULT",
  "NEXT_PUBLIC_BID_MARKET_MIA_TPA",
  "NEXT_PUBLIC_BID_MARKET_CITY_FIELD",
  "NEXT_PUBLIC_BID_MARKET_AUSTIN",
  "RH_RPC_URL",
  "PONS_FEE_ESCROW",
  "PONS_FACTORY",
  "PONS_CURVE_ADDRESS",
  "PONS_FEE_HOOK",
  "PONS_QUOTE_ASSET",
  "BID_RESOLUTION_ORACLE",
  "BID_FACTORY_OWNER",
  "BID_TREASURY_OWNER",
  "BID_LIQUIDITY_OPERATOR",
  "BID_LIQUIDITY_VAULT_OWNER",
];

const errors = [];
const warnings = [];
const value = (key) => process.env[key]?.trim() ?? "";
const launchState = value("NEXT_PUBLIC_LAUNCH_STATE") || "prelaunch";
const network = value("NEXT_PUBLIC_BID_NETWORK") || "mainnet";

if (!["prelaunch", "demo", "live"].includes(launchState)) {
  errors.push("NEXT_PUBLIC_LAUNCH_STATE must be prelaunch, demo, or live");
}
if (!["testnet", "mainnet"].includes(network)) {
  errors.push("NEXT_PUBLIC_BID_NETWORK must be testnet or mainnet");
}

for (const [key, raw] of Object.entries(process.env)) {
  if (!raw) continue;
  if (!/^(NEXT_PUBLIC_|BID_|PONS_|KEEPER_|RH_RPC_URL|PRODUCTION_)/.test(key)) continue;
  if (key.startsWith("NEXT_PUBLIC_") && /(private.?key|secret|service.?role|password|mnemonic)/i.test(key)) {
    errors.push(`${key} exposes secret material to the browser`);
  }
  if (PLACEHOLDER.test(raw)) errors.push(`${key} contains a placeholder value`);
}

for (const key of ADDRESS_KEYS) {
  const raw = value(key);
  if (!raw) continue;
  const zeroAllowed = key === "PONS_QUOTE_ASSET";
  if (!isAddress(raw) || (!zeroAllowed && /^0x0{40}$/i.test(raw))) {
    errors.push(`${key} must be a valid${zeroAllowed ? "" : " nonzero"} EVM address`);
  }
}

if (value("NEXT_PUBLIC_CREATOR_TAX_BPS") && value("NEXT_PUBLIC_CREATOR_TAX_BPS") !== "250") {
  errors.push("NEXT_PUBLIC_CREATOR_TAX_BPS must be 250 for the published BID flywheel");
}
if (value("PONS_PROTOCOL_VERSION") && value("PONS_PROTOCOL_VERSION") !== "v2") {
  errors.push("PONS_PROTOCOL_VERSION must be v2 for creator-tax verification");
}

if (launchState === "live") {
  if (network !== "mainnet") errors.push("live launch state requires NEXT_PUBLIC_BID_NETWORK=mainnet");
  for (const key of LIVE_KEYS) {
    if (!value(key)) errors.push(`${key} is required for live mode`);
  }
  if (value("NEXT_PUBLIC_PONS_VERIFIED") !== "true") {
    errors.push("NEXT_PUBLIC_PONS_VERIFIED must be true after onchain verification");
  }
  if (value("PONS_PROTOCOL_VERSION") !== "v2") {
    errors.push("PONS_PROTOCOL_VERSION=v2 is required for live mode");
  }
  if (value("PRODUCTION_ACTIVATION_ACK") !== "I_UNDERSTAND_MAINNET") {
    errors.push("PRODUCTION_ACTIVATION_ACK is required before live mode");
  }
  try {
    const siteUrl = new URL(value("NEXT_PUBLIC_SITE_URL"));
    if (siteUrl.protocol !== "https:") errors.push("NEXT_PUBLIC_SITE_URL must use HTTPS in live mode");
  } catch {
    errors.push("NEXT_PUBLIC_SITE_URL must be a valid production URL");
  }
}

if (value("KEEPER_EXECUTION_ENABLED") === "true") {
  for (const key of ["KEEPER_PRIVATE_KEY", "KEEPER_EXPECTED_ADDRESS", "KEEPER_MARKETS"]) {
    if (!value(key)) errors.push(`${key} is required when keeper execution is enabled`);
  }
  if (!/^0x[0-9a-f]{64}$/i.test(value("KEEPER_PRIVATE_KEY"))) {
    errors.push("KEEPER_PRIVATE_KEY must be a 32-byte hex key");
  }
} else {
  warnings.push("keeper execution is disabled (read-only health mode)");
}

if (value("LP_DEPLOYMENT_ENABLED") === "true") {
  if (value("KEEPER_EXECUTION_ENABLED") !== "true") {
    errors.push("LP_DEPLOYMENT_ENABLED requires KEEPER_EXECUTION_ENABLED=true");
  }
  for (const key of ["NEXT_PUBLIC_BID_COLLATERAL_ADDRESS", "NEXT_PUBLIC_BID_LIQUIDITY_VAULT"]) {
    if (!value(key)) errors.push(`${key} is required when LP deployment is enabled`);
  }
}

if (value("PONS_HOOK_SWEEP_ENABLED") === "true") {
  for (const key of ["PONS_FEE_HOOK", "PONS_POOL_ID", "NEXT_PUBLIC_BID_CONTRACT_ADDRESS"]) {
    if (!value(key)) errors.push(`${key} is required when Pons hook sweeping is enabled`);
  }
  if (!/^0x[0-9a-f]{64}$/i.test(value("PONS_POOL_ID"))) {
    errors.push("PONS_POOL_ID must be a bytes32 value");
  }
}

if (launchState !== "live") warnings.push(`frontend is in ${launchState} mode`);

for (const warning of warnings) console.log(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL  ${error}`);
  console.error(`\nEnvironment check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`PASS  environment is valid for ${network}/${launchState}`);
