import http from "node:http";

const port = Number(process.env.PORT || 8080);
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const programId = process.env.HOOD_OPTIONS_PROGRAM_ID || "";
const collateralMint = process.env.COLLATERAL_MINT || "";
const oracleFeed = process.env.HOOD_ORACLE_FEED || "";

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error("RPC request failed");
  }
  return payload.result;
}

async function accountInfo(address) {
  const result = await rpc("getAccountInfo", [address, { encoding: "base64" }]);
  return result?.value || null;
}

const server = http.createServer(async (request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end("not found");
    return;
  }

  let rpcHealthy = false;
  let configuration = "prelaunch";
  try {
    rpcHealthy = (await rpc("getHealth")) === "ok";
    if (programId && collateralMint && oracleFeed) {
      const [program, mint, oracle] = await Promise.all([
        accountInfo(programId),
        accountInfo(collateralMint),
        accountInfo(oracleFeed),
      ]);
      configuration = program?.executable && mint && oracle ? "verified" : "invalid";
    }
  } catch {
    rpcHealthy = false;
  }

  const healthy = rpcHealthy && configuration !== "invalid";
  response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
  response.end(JSON.stringify({
    service: "hood-options-keeper",
    status: healthy ? "healthy" : "degraded",
    configuration,
    execution: "disabled",
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`hood-options keeper health service listening on ${port}`);
});
