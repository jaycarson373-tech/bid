import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Railway deployer is restricted to the one-time beta recovery", async () => {
  const config = JSON.parse(await read("railway.beta.json"));
  const dockerfile = await read("Dockerfile.beta");

  assert.equal(config.build.builder, "DOCKERFILE");
  assert.equal(config.build.dockerfilePath, "Dockerfile.beta");
  assert.equal(config.deploy.restartPolicyType, "NEVER");
  assert.match(dockerfile, /RecoverPublicBetaLiquidity/);
  assert.doesNotMatch(dockerfile, /DeployBidBeta/);
  assert.match(dockerfile, /--broadcast/);
  assert.match(dockerfile, /RUN chown -R foundry:foundry/);
  assert.match(dockerfile, /CMD \["forge"/);
});

test("LP deployer and Pons creator keys remain separate", async () => {
  const betaScript = await read("contracts/script/DeployBidBeta.s.sol");
  const ponsScript = await read("contracts/script/LaunchBidOnPons.s.sol");
  const keeper = await read("services/keeper.mjs");

  assert.match(betaScript, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(betaScript, /PONS_CREATOR_PRIVATE_KEY/);
  assert.match(betaScript, /BID_GENESIS_MARKET_COUNT/);
  assert.match(ponsScript, /PONS_CREATOR_PRIVATE_KEY/);
  assert.doesNotMatch(ponsScript, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.match(keeper, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(keeper, /PONS_CREATOR_PRIVATE_KEY/);
  assert.match(keeper, /0x99e8d451e0c936010f0f5d30a7f7b8e773bd8d5b/);
  assert.match(keeper, /0x8d9a7d0e8ccddd7baebba3173a0afc3e24fdb606/);
  assert.match(keeper, /retiredMarketsIgnored/);
  assert.match(keeper, /pendingFees/);
  assert.match(keeper, /pendingCreatorTax/);
  assert.match(keeper, /sweep_and_convert_pons_pool_fees/);
  assert.match(keeper, /PONS_MIN_CONVERSION_QUOTE_OUT must be greater than zero/);
});
