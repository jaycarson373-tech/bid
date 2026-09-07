import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const source = await readFile(
  new URL("../contracts/script/RecoverPublicBetaLiquidity.s.sol", import.meta.url),
  "utf8",
);

test("beta recovery is pinned to the verified market, chain, and recipient", () => {
  assert.match(source, /block\.chainid == 4663/);
  assert.match(source, /0xb5693d5C6c944Bea96c1c62B66c736D5C69AAd32/);
  assert.match(source, /0xD935D28E466A3a95c4c4daA1421Fc8E1a5af24aD/);
  assert.match(source, /totalShares == walletShares \+ vaultShares/);
});

test("beta recovery withdraws both LP positions and empties the vault", () => {
  assert.match(source, /MARKET\.removeFundingToCollateral/);
  assert.match(source, /VAULT\.removeLiquidity/);
  assert.match(source, /VAULT\.recoverToken\(USDG, RECIPIENT, vaultBalance\)/);
  assert.match(source, /MARKET\.totalSupply\(\) == 0/);
  assert.match(source, /USDG\.balanceOf\(address\(VAULT\)\) == 0/);
});

test("beta recovery is replay-safe", () => {
  assert.match(source, /totalShares == 0 && USDG\.balanceOf\(address\(VAULT\)\) == 0/);
  assert.match(source, /already recovered; no transaction submitted/);
});

test("retired EVM deployment and recovery commands are not exposed", async () => {
  const manifest = JSON.parse(await read("package.json"));

  assert.equal(manifest.scripts["deploy:beta"], undefined);
  assert.equal(manifest.scripts["verify:beta"], undefined);
  assert.equal(manifest.scripts["recover:beta:check"], undefined);
  assert.equal(manifest.scripts["recover:beta"], undefined);
  assert.equal(manifest.scripts["rewards:build"], undefined);
  assert.match(manifest.scripts["verify:production"], /verify-hood-options/);
});

test("v2 policy retains the requested 5 to 50 USDG order range", async () => {
  const policy = JSON.parse(await read("config/bid-market-policy-v2.json"));

  assert.equal(policy.minimumOrderAtomic, "5000000");
  assert.equal(policy.maximumOrderAtomic, "50000000");
  assert.equal(policy.payoutPerWinningShareAtomic, "1000000");
  assert.equal(policy.targetFormat, "BINARY_UP_DOWN");
  assert.equal(policy.communityCreationEnabled, false);
});
