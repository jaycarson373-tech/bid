import { address } from "@solana/kit";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const programId = process.env.HOOD_OPTIONS_PROGRAM_ID || process.env.NEXT_PUBLIC_HOOD_OPTIONS_PROGRAM_ID;
const collateralMint = process.env.COLLATERAL_MINT || process.env.NEXT_PUBLIC_COLLATERAL_MINT;
const oracleFeed = process.env.HOOD_ORACLE_FEED || process.env.NEXT_PUBLIC_HOOD_ORACLE_FEED;

for (const [name, value] of Object.entries({ rpcUrl, programId, collateralMint, oracleFeed })) {
  if (!value) throw new Error(`${name} is required`);
  if (name !== "rpcUrl") address(value);
}

let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`${method} failed`);
  return payload.result;
}

async function accountInfo(value) {
  const result = await rpc("getAccountInfo", [value, { encoding: "base64" }]);
  return result?.value || null;
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

try {
  const genesis = await rpc("getGenesisHash");
  check("Solana mainnet", genesis === MAINNET_GENESIS, genesis);

  const [program, mint, oracle] = await Promise.all([
    accountInfo(programId),
    accountInfo(collateralMint),
    accountInfo(oracleFeed),
  ]);
  check("Program deployed", program?.executable, programId);
  check("Collateral mint", mint && TOKEN_PROGRAMS.has(mint.owner), collateralMint);
  check("HOOD oracle account", oracle, oracleFeed);
} catch (error) {
  check("RPC verification", false, error instanceof Error ? error.message : "unknown error");
}

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}

if (checks.some((item) => !item.ok)) process.exit(1);
