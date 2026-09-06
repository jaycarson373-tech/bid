import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

for (const correctChain of [true, false]) {
  test(`packaged Railway keeper ${correctChain ? "boots read-only" : "rejects wrong chain"}`, { timeout: 20_000 }, async (t) => {
    const stage = await mkdtemp(join(tmpdir(), "bid-keeper-test-"));
    t.after(() => rm(stage, { recursive: true, force: true }));
    const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    // Reproduce the source COPY instructions so missing runtime modules fail here.
    for (const [, source, destination] of dockerfile.matchAll(/^COPY (\S+) (\.\/\S*|\.\/)$/gm)) {
      await cp(new URL(`../${source}`, import.meta.url), join(stage, destination, destination === "./" ? source : ""), { recursive: true });
    }
    await symlink(await realpath(new URL("../node_modules", import.meta.url)), join(stage, "node_modules"));
    const rpc = createServer(async (request, response) => {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: correctChain ? "0x1237" : "0x1" }));
    });
    rpc.listen(0, "127.0.0.1");
    await once(rpc, "listening");
    t.after(() => rpc.close());
    const child = spawn(process.execPath, ["services/keeper.mjs"], {
      cwd: stage,
      env: { PATH: process.env.PATH, RH_RPC_URL: `http://127.0.0.1:${rpc.address().port}`, BID_EXPECTED_CHAIN_ID: "4663", PORT: "0", KEEPER_EXECUTION_ENABLED: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    t.after(async () => { if (child.exitCode === null) child.kill(); await exited; });
    let output = "";
    child.stderr.on("data", chunk => { output += chunk; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("keeper startup timed out")), 10_000);
      child.stdout.on("data", chunk => {
        output += chunk;
        if (correctChain && output.includes('"event":"keeper_ready"')) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", code => {
        clearTimeout(timer);
        if (correctChain) reject(new Error(`unexpected keeper exit ${code}: ${output}`));
        else resolve();
      });
    });
    if (correctChain) {
      assert.match(output, /"mode":"read-only"/);
      assert.match(output, /"chainId":4663/);
      assert.doesNotMatch(output, /transaction_submitted/);
    } else assert.match(output, /RPC chain 1 does not match expected chain 4663/);
  });
}
