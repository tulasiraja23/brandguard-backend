// Run with:  node --test src/utils/analyzer.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeContent,
  buildRewrite,
  buildSegments,
  DEFAULT_RULES,
  DEFAULT_FACTS,
  DEMO_CONTENT,
} from "./analyzer.js";

const facts = DEFAULT_FACTS.items;
const run = (text, f = facts, r = DEFAULT_RULES) => analyzeContent(text, r, f);

test("demo: 1-litre contradicts the approved 750 ml fact, with evidence", () => {
  const { findings, risk } = run(DEMO_CONTENT);
  const claim = findings.find((f) => f.verdict === "contradicted");
  assert.ok(claim, "expected a contradicted claim");
  assert.equal(claim.severity, "High");
  assert.equal(claim.matchedText, "1-litre");
  assert.match(claim.evidence.excerpt, /750 ml/);
  assert.equal(risk, "High");
});

test("demo: 'clinically proven' and 'world's safest' are flagged, not called false", () => {
  const { findings } = run(DEMO_CONTENT);
  const titles = findings.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes("clinically proven")));
  assert.ok(titles.some((t) => t.includes("world's safest")));
  assert.ok(findings.every((f) => f.verdict !== "contradicted" || f.matchedText === "1-litre"));
});

test("demo: '48 hours' is UNVERIFIED (Medium), never contradicted, when no time fact exists", () => {
  const f = run(DEMO_CONTENT).findings.find((x) => x.matchedText === "48 hours");
  assert.equal(f.verdict, "unverified");
  assert.equal(f.severity, "Medium");
  assert.equal(f.evidence, null);
});

test("a time fact turns '48 hours' into a contradiction", () => {
  const withTime = [
    ...facts,
    { id: "t", name: "Cold retention", dimension: "time", value: 24, unit: "hour", sourceName: "Lab note", excerpt: "Stays cold for 24 hours.", version: 1 },
  ];
  const f = run("Keeps drinks cold for 48 hours.", withTime).findings.find((x) => x.matchedText === "48 hours");
  assert.equal(f.verdict, "contradicted");
});

test("matching figures are SUPPORTED and do not raise risk; units convert (0.75 L = 750 ml)", () => {
  const { findings, risk } = run("It holds 0.75 L of water.");
  assert.equal(findings[0].verdict, "supported");
  assert.equal(risk, "None");
});

test("word boundaries: 'secures' does not trigger the 'cures' rule", () => {
  assert.equal(run("This lid secures your drink.").findings.length, 0);
});

test("repeated phrases are all reported", () => {
  const { findings } = run("Guaranteed fun. Guaranteed savings. guaranteed!");
  assert.equal(findings.filter((f) => f.ruleId === "BG-R001").length, 3);
});

test("curly apostrophes still match", () => {
  const { findings } = run("The world\u2019s safest bottle.");
  assert.ok(findings.some((f) => f.ruleId === "BG-R007"));
});

test("overall risk is the highest severity, not an averaged score", () => {
  assert.equal(run("Guaranteed results for everyone today.").risk, "High");
  assert.equal(run("Our SUPERB bottle is here for you today!!").risk, "Low");
});

test("'5G' is not read as 5 grams", () => {
  assert.equal(run("Now with 5G connectivity for everyone.").findings.length, 0);
});

test("rewrite uses only approved figures and keeps text outside findings", () => {
  const { findings } = run(DEMO_CONTENT);
  const rewrite = buildRewrite(DEMO_CONTENT, findings);
  assert.ok(rewrite.includes("750 ml"));
  assert.ok(!rewrite.includes("1-litre"));
  assert.ok(rewrite.startsWith("Meet our new"));
});

test("segments cover the whole text exactly", () => {
  const { findings } = run(DEMO_CONTENT);
  const joined = buildSegments(DEMO_CONTENT, findings).map((s) => s.text).join("");
  assert.equal(joined, DEMO_CONTENT);
});
