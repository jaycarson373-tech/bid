import { address } from "@solana/kit";

const PROGRAM_ID = "E86s7fVfuaufjfwbKG6Nm7p8kNYStUrCFKkQH5kyubs4";
const errors = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) errors.push(`${name} is required`);
  return value || "";
}

function solanaAddress(name, value) {
  if (!value) return;
  try {
    address(value);
  } catch {
    errors.push(`${name} is not a valid Solana address`);
  }
}

function rpcUrl(name, value) {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    errors.push(`${name} must be an HTTP(S) URL`);
  }
}

const publicRpc = required("NEXT_PUBLIC_SOLANA_RPC_URL");
const workerRpc = required("SOLANA_RPC_URL");
const publicProgram = required("NEXT_PUBLIC_HOOD_OPTIONS_PROGRAM_ID");
const workerProgram = required("HOOD_OPTIONS_PROGRAM_ID");
const publicMint = required("NEXT_PUBLIC_COLLATERAL_MINT");
const workerMint = required("COLLATERAL_MINT");
const publicOracle = required("NEXT_PUBLIC_HOOD_ORACLE_FEED");
const workerOracle = required("HOOD_ORACLE_FEED");

rpcUrl("NEXT_PUBLIC_SOLANA_RPC_URL", publicRpc);
rpcUrl("SOLANA_RPC_URL", workerRpc);
for (const [name, value] of [
  ["NEXT_PUBLIC_HOOD_OPTIONS_PROGRAM_ID", publicProgram],
  ["HOOD_OPTIONS_PROGRAM_ID", workerProgram],
  ["NEXT_PUBLIC_COLLATERAL_MINT", publicMint],
  ["COLLATERAL_MINT", workerMint],
  ["NEXT_PUBLIC_HOOD_ORACLE_FEED", publicOracle],
  ["HOOD_ORACLE_FEED", workerOracle],
]) solanaAddress(name, value);

if (publicProgram && publicProgram !== PROGRAM_ID) {
  errors.push("NEXT_PUBLIC_HOOD_OPTIONS_PROGRAM_ID does not match the compiled program");
}
if (workerProgram && workerProgram !== PROGRAM_ID) {
  errors.push("HOOD_OPTIONS_PROGRAM_ID does not match the compiled program");
}
if (publicMint && workerMint && publicMint !== workerMint) {
  errors.push("Vercel and Railway collateral mints differ");
}
if (publicOracle && workerOracle && publicOracle !== workerOracle) {
  errors.push("Vercel and Railway oracle feeds differ");
}

if (errors.length) {
  console.error("HOOD Options environment: FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("HOOD Options environment: PASS");
