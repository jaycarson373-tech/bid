import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { isAddress, zeroAddress } from "viem";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let account;
let broadcast = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--broadcast") broadcast = true;
  else if (args[i] === "--account" && args[i + 1] && !args[i + 1].startsWith("-")) account = args[++i];
  else {
    console.error("Usage: npm run deploy:beta -- [--account encrypted-keystore-name] [--broadcast]");
    process.exit(1);
  }
}
if (broadcast && !account) {
  console.error("FAIL: broadcasting requires --account with a local encrypted Foundry keystore. Never pass a raw private key.");
  process.exit(1);
}
const defaults = parseEnv(readFileSync(new URL("../.env.production.example", import.meta.url), "utf8"));
const env = { ...defaults, ...process.env };
env.RH_RPC_URL ||= env.NEXT_PUBLIC_BID_RPC_URL;
// The child only signs with the explicitly selected encrypted local keystore.
for (const key of Object.keys(env)) {
  if (/PRIVATE_KEY|MNEMONIC|SECRET|SERVICE_ROLE|PASSWORD|API_KEY|ACCESS_TOKEN/i.test(key)) delete env[key];
}
if (account) {
  const derived = spawnSync("cast", ["wallet", "address", "--account", account], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  const derivedAddress = derived.stdout?.trim() || "";
  if (derived.status !== 0 || !isAddress(derivedAddress)) {
    console.error("FAIL: unable to unlock the selected encrypted Foundry keystore.");
    process.exit(1);
  }
  if (env.BID_DEPLOYER && env.BID_DEPLOYER.toLowerCase() !== derivedAddress.toLowerCase()) {
    console.error("FAIL: BID_DEPLOYER does not match the selected encrypted keystore.");
    process.exit(1);
  }
  env.BID_DEPLOYER = derivedAddress;
}
const ownerRoles = [
  "BID_TREASURY_OWNER",
  "BID_REWARDS_OWNER",
  "BID_LIQUIDITY_OPERATOR",
  "BID_LIQUIDITY_VAULT_OWNER",
  "BID_RESOLUTION_ORACLE",
];
for (const key of ownerRoles) env[key] ||= env.BID_DEPLOYER;
const required = ["BID_DEPLOYER", ...ownerRoles];
const errors = required.filter(key => !isAddress(env[key] || "") || env[key].toLowerCase() === zeroAddress)
  .map(key => `${key}: set a valid nonzero PUBLIC address`);
if (!/^\d+$/.test(env.BID_MARKET_CLOSE_TIME || "") || BigInt(env.BID_MARKET_CLOSE_TIME) <= BigInt(Math.floor(Date.now() / 1000))) {
  errors.push("BID_MARKET_CLOSE_TIME: set a future Unix timestamp consistent with published market rules");
}
for (const [key, value] of Object.entries({ BID_EXPECTED_CHAIN_ID: "4663", BID_GENESIS_MARKET_COUNT: "1", BID_INITIAL_LIQUIDITY: "25000000", BID_MAX_TRADE_AMOUNT: "1000000" })) {
  if (env[key] !== value) errors.push(`${key}: this beta command requires ${value}`);
}
if (errors.length) {
  console.error(`FAIL: use --account with an encrypted Foundry keystore, or set BID_DEPLOYER as a public address:\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(broadcast
  ? "MAINNET BROADCAST: one encrypted wallet temporarily owns beta administration; separate reserve vaults are created automatically."
  : "READ-ONLY SIMULATION: one deployer address fills temporary beta roles and separate reserve vaults are created. No funds spent.");
const command = ["script", "script/DeployBidBeta.s.sol:DeployBidBeta", "--root", "contracts", "--rpc-url", env.RH_RPC_URL, "--sender", env.BID_DEPLOYER, "-vv"];
if (account) command.push("--account", account);
if (broadcast) command.push("--broadcast", "--slow");
const result = spawnSync("forge", command, { cwd: root, env, stdio: "inherit" });
if (result.error) console.error("FAIL: Foundry forge is required; deployment did not start.");
if (broadcast && result.status !== 0) console.error("STOP: broadcast may be partial. Inspect contracts/broadcast receipts; do not rerun a fresh deployment.");
process.exit(result.status ?? 1);
