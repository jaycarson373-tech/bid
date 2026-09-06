import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Railway beta service is a one-shot mainnet deployment", async () => {
  const config = JSON.parse(await read("railway.beta.json"));
  const dockerfile = await read("Dockerfile.beta");

  assert.equal(config.build.builder, "DOCKERFILE");
  assert.equal(config.build.dockerfilePath, "Dockerfile.beta");
  assert.equal(config.deploy.restartPolicyType, "NEVER");
  assert.match(dockerfile, /DeployBidBeta\.s\.sol:DeployBidBeta/);
  assert.match(dockerfile, /https:\/\/rpc\.mainnet\.chain\.robinhood\.com/);
  assert.match(dockerfile, /--broadcast/);
});

test("LP deployer and Pons creator keys remain separate", async () => {
  const betaScript = await read("contracts/script/DeployBidBeta.s.sol");
  const ponsScript = await read("contracts/script/LaunchBidOnPons.s.sol");
  const keeper = await read("services/keeper.mjs");

  assert.match(betaScript, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(betaScript, /PONS_CREATOR_PRIVATE_KEY/);
  assert.match(betaScript, /vm\.getNonce\(deployer\) == 0/);
  assert.match(ponsScript, /PONS_CREATOR_PRIVATE_KEY/);
  assert.doesNotMatch(ponsScript, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.match(keeper, /LP_DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(keeper, /PONS_CREATOR_PRIVATE_KEY/);
});
