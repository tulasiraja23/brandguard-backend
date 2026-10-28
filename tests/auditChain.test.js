import test from "node:test";
import assert from "node:assert/strict";
import { GENESIS_HASH, computeHash, verifyChain, stableStringify } from "../src/services/auditChain.js";

function buildChain(n = 5) {
  const entries = [];
  let prevHash = GENESIS_HASH;
  for (let i = 1; i <= n; i += 1) {
    const entry = {
      seq: i, organisation: "org1", actor: i % 2 ? "u1" : "u2", action: `action.${i}`,
      entityType: "Submission", entityId: `s${i}`, details: { risk: "High", n: i, nested: { b: 1, a: 2 } },
      prevHash, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    };
    entry.hash = computeHash(entry);
    entries.push(entry);
    prevHash = entry.hash;
  }
  return entries;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

test("an untouched chain verifies", () => {
  const result = verifyChain(buildChain());
  assert.equal(result.valid, true);
  assert.equal(result.checked, 5);
  assert.match(result.headHash, /^[0-9a-f]{64}$/);
});

test("an empty chain is valid", () => assert.equal(verifyChain([]).valid, true));

test("editing an entry's details is detected at that entry", () => {
  const chain = clone(buildChain());
  chain[2].details.risk = "Low"; // someone quietly downgrades a risk
  const result = verifyChain(chain);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 3);
  assert.match(result.reason, /modified/);
});

test("rewriting an entry AND its hash still breaks the next link", () => {
  const chain = clone(buildChain());
  chain[1].action = "content.approved";
  chain[1].hash = computeHash(chain[1]);
  const result = verifyChain(chain);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 3);
});

test("deleting a middle entry is detected", () => {
  const chain = clone(buildChain());
  chain.splice(2, 1);
  const result = verifyChain(chain);
  assert.equal(result.valid, false);
  assert.match(result.reason, /gap/);
});

test("deleting the first entry is detected", () => {
  const chain = clone(buildChain());
  chain.shift();
  assert.equal(verifyChain(chain).valid, false);
});

test("key order in details does not change the hash", () => {
  assert.equal(stableStringify({ a: 1, b: { d: 1, c: 2 } }), stableStringify({ b: { c: 2, d: 1 }, a: 1 }));
});

test("hash survives a JSON round trip (dates become strings)", () => {
  const chain = clone(buildChain());
  assert.equal(verifyChain(chain).valid, true);
});
