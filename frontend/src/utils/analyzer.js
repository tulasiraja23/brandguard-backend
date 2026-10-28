// BrandGuard AI — deterministic analysis engine (rule checks + claim checks).
// Pure functions with no React or browser dependencies, so they are easy to test
// and can later be moved to the Express backend unchanged.
//
// IMPORTANT HONESTY NOTE: everything in this file is rule-based. "Supported" means
// "matches an approved fact that a person entered", NOT "independently verified".

export const SEVERITIES = ["High", "Medium", "Low"];
const SEVERITY_RANK = { High: 3, Medium: 2, Low: 1, Info: 0 };

/* ------------------------------ units & facts ------------------------------ */

// factor = multiplier into the base unit of that dimension
// (volume: ml, mass: g, time: hour, length: mm)
export const UNITS = {
  ml: { dimension: "volume", factor: 1, label: "ml" },
  l: { dimension: "volume", factor: 1000, label: "L" },
  g: { dimension: "mass", factor: 1, label: "g" },
  kg: { dimension: "mass", factor: 1000, label: "kg" },
  hour: { dimension: "time", factor: 1, label: "hours" },
  minute: { dimension: "time", factor: 1 / 60, label: "minutes" },
  day: { dimension: "time", factor: 24, label: "days" },
  mm: { dimension: "length", factor: 1, label: "mm" },
  cm: { dimension: "length", factor: 10, label: "cm" },
};

export const DIMENSIONS = {
  volume: { label: "Volume", units: ["ml", "l"] },
  mass: { label: "Weight", units: ["g", "kg"] },
  time: { label: "Time / duration", units: ["hour", "minute", "day"] },
  length: { label: "Length", units: ["mm", "cm"] },
  text: { label: "Text (reference only)", units: [] },
};

const ALIASES = {
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour",
  minute: "minute", minutes: "minute", min: "minute", mins: "minute",
  day: "day", days: "day",
  mm: "mm", cm: "cm",
};

const UNIT_PATTERN = Object.keys(ALIASES)
  .sort((a, b) => b.length - a.length)
  .join("|");

const QUANTITY_SOURCE =
  "(\\d{1,3}(?:,\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*-?\\s*(" + UNIT_PATTERN + ")(?![A-Za-z])";

export function formatQuantity(value, unitKey) {
  const unit = UNITS[unitKey];
  if (!unit) return String(value);
  let label = unit.label;
  if (Number(value) === 1 && label.endsWith("s")) label = label.slice(0, -1);
  return `${value} ${label}`;
}

function parseNumber(raw) {
  if (/^\d{1,3}(,\d{3})+$/.test(raw)) return Number(raw.replace(/,/g, ""));
  return Number(raw.replace(",", "."));
}

function approxEqual(a, b) {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.005;
}

/* ------------------------------- helpers ------------------------------- */

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Straighten curly quotes. Same string length, so match offsets stay valid.
const normalise = (text) => text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

function makeFinding(base) {
  return {
    source: "rule", // who produced it: "rule" now, "ai" once the LLM step exists
    verdict: null, // "supported" | "contradicted" | "unverified" | null
    evidence: null, // { sourceName, excerpt, version } when a trusted fact is involved
    replacement: null,
    ...base,
    end: base.start + base.matchedText.length,
  };
}

/* ------------------------------ rule checks ------------------------------ */

function checkPhraseRules(content, rules) {
  const findings = [];
  const text = normalise(content);

  for (const rule of rules) {
    const term = normalise((rule.phrase || "").trim());
    if (!term) continue;

    // Lookarounds (not \b) so phrases that start/end with symbols still work,
    // while "cures" no longer matches inside "secures".
    const pattern = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "gi");
    for (const match of text.matchAll(pattern)) {
      findings.push(
        makeFinding({
          id: `${rule.code}-${match.index}`,
          ruleId: rule.code,
          category: "terminology",
          severity: rule.severity || "Medium",
          title: `Flagged phrase: "${term}"`,
          detail:
            rule.reason ||
            "This phrase matches a configured brand rule. Claims like this need supporting evidence before publishing.",
          reason: `Rule ${rule.code} is configured as ${rule.severity || "Medium"} severity.`,
          start: match.index,
          matchedText: content.slice(match.index, match.index + term.length),
          suggestion: `Replace "${term}" with a specific statement you can substantiate, or remove it.`,
          replacement: "[verify this claim]",
        })
      );
    }
  }
  return findings;
}

/* ------------------------------ claim checks ------------------------------ */

function checkQuantityClaims(content, facts) {
  const findings = [];
  const numericFacts = facts.filter((fact) => UNITS[fact.unit]);
  const regex = new RegExp(QUANTITY_SOURCE, "gi");

  for (const match of content.matchAll(regex)) {
    const [matchedText, rawNumber, rawUnit] = match;
    if (rawUnit === "G") continue; // "5G" is a network, not 5 grams
    const unitKey = ALIASES[rawUnit.toLowerCase()];
    const unit = UNITS[unitKey];
    const quantity = parseNumber(rawNumber);
    if (!unit || Number.isNaN(quantity)) continue;

    const claimBase = quantity * unit.factor;
    const sameDimension = numericFacts.filter((fact) => UNITS[fact.unit].dimension === unit.dimension);
    const common = { start: match.index, matchedText, category: "claim", ruleId: "BG-CLAIM" };

    if (sameDimension.length === 0) {
      findings.push(
        makeFinding({
          ...common,
          id: `claim-${match.index}`,
          severity: "Medium",
          verdict: "unverified",
          title: `Unverified claim: "${matchedText}"`,
          detail:
            "No approved fact covers this kind of measurement, so the claim could not be checked. Unverified does not mean false.",
          reason: "A specific, measurable claim with no supporting source on file.",
          suggestion: "Add an approved source for this figure in Trusted Facts, or remove the claim.",
        })
      );
      continue;
    }

    const supporting = sameDimension.find((fact) => approxEqual(fact.value * UNITS[fact.unit].factor, claimBase));
    if (supporting) {
      findings.push(
        makeFinding({
          ...common,
          id: `claim-${match.index}`,
          severity: "Info",
          verdict: "supported",
          title: `Supported: "${matchedText}"`,
          detail: `Matches the approved fact "${supporting.name}" (${formatQuantity(supporting.value, supporting.unit)}).`,
          reason: "Matches an approved fact entered in Trusted Facts.",
          evidence: { sourceName: supporting.sourceName, excerpt: supporting.excerpt, version: supporting.version },
          suggestion: "No change needed.",
        })
      );
      continue;
    }

    const closest = [...sameDimension].sort(
      (a, b) =>
        Math.abs(a.value * UNITS[a.unit].factor - claimBase) -
        Math.abs(b.value * UNITS[b.unit].factor - claimBase)
    )[0];
    const approved = formatQuantity(closest.value, closest.unit);

    findings.push(
      makeFinding({
        ...common,
        id: `claim-${match.index}`,
        severity: "High",
        verdict: "contradicted",
        title: `Contradicts approved fact: "${matchedText}"`,
        detail: `The approved fact "${closest.name}" says ${approved}, but the content says ${matchedText}.`,
        reason: "A specific product fact conflicts with an approved source. Publishing it could mislead customers.",
        evidence: { sourceName: closest.sourceName, excerpt: closest.excerpt, version: closest.version },
        suggestion: `Use the approved figure: ${approved}.`,
        replacement: approved,
      })
    );
  }
  return findings;
}

/* ------------------------------ tone checks ------------------------------ */

function checkTone(content) {
  const findings = [];

  for (const match of content.matchAll(/\b[A-Z]{5,}\b/g)) {
    findings.push(
      makeFinding({
        id: `tone-caps-${match.index}`,
        ruleId: "BG-TONE-001",
        category: "tone",
        severity: "Low",
        title: "Excessive capital letters",
        detail: "All-caps text can sound aggressive and may not match your brand's tone.",
        reason: "Minor tone issue.",
        start: match.index,
        matchedText: match[0],
        suggestion: "Use normal sentence capitalisation.",
        replacement: match[0].charAt(0) + match[0].slice(1).toLowerCase(),
      })
    );
  }

  for (const match of content.matchAll(/!{2,}/g)) {
    findings.push(
      makeFinding({
        id: `tone-punct-${match.index}`,
        ruleId: "BG-TONE-002",
        category: "tone",
        severity: "Low",
        title: "Excessive punctuation",
        detail: "Repeated exclamation marks may make the message feel unprofessional.",
        reason: "Minor tone issue.",
        start: match.index,
        matchedText: match[0],
        suggestion: "Use a single exclamation mark or a full stop.",
        replacement: "!",
      })
    );
  }

  const trimmed = content.trim();
  if (trimmed.length > 0 && trimmed.length < 20) {
    findings.push(
      makeFinding({
        id: "tone-short",
        ruleId: "BG-CONTEXT-001",
        category: "tone",
        severity: "Low",
        title: "Content may lack context",
        detail: "This short message may not give readers enough information.",
        reason: "Minor completeness issue.",
        start: 0,
        matchedText: content,
        suggestion: "Add useful details about the product or offer.",
      })
    );
  }
  return findings;
}

/* ------------------------------ public API ------------------------------ */

export function analyzeContent(content, rules, facts) {
  const findings = [
    ...checkPhraseRules(content, rules),
    ...checkQuantityClaims(content, facts),
    ...checkTone(content),
  ].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.start - b.start);

  const actionable = findings.filter((finding) => finding.severity !== "Info");
  const top = actionable[0];
  const risk = top ? top.severity : "None";
  const sameLevel = actionable.filter((finding) => finding.severity === risk).length;

  return {
    findings,
    risk, // overall risk = the highest severity found, never an averaged score
    riskReason: top
      ? `${sameLevel} ${risk}-severity finding${sameLevel > 1 ? "s" : ""}, e.g. ${top.title}. ` +
        "Risk levels help prioritise review; they are not a legal determination."
      : "No issues were found by the configured rules and facts. This does not guarantee compliance.",
    counts: {
      High: findings.filter((f) => f.severity === "High").length,
      Medium: findings.filter((f) => f.severity === "Medium").length,
      Low: findings.filter((f) => f.severity === "Low").length,
      supported: findings.filter((f) => f.verdict === "supported").length,
    },
  };
}

// Builds a suggested rewrite from findings that carry a replacement.
// Applied from the end of the text backwards so earlier offsets stay valid.
export function buildRewrite(content, findings) {
  const replacements = findings
    .filter((finding) => finding.replacement != null)
    .sort((a, b) => b.start - a.start);

  let result = content;
  let limit = Infinity;
  for (const finding of replacements) {
    if (finding.end > limit) continue; // overlaps a replacement already applied
    result = result.slice(0, finding.start) + finding.replacement + result.slice(finding.end);
    limit = finding.start;
  }
  return result;
}

// Splits text into plain and flagged segments for inline highlighting.
export function buildSegments(content, findings) {
  const spans = findings
    .filter((finding) => finding.severity !== "Info" && finding.end > finding.start)
    .sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const finding of spans) {
    if (finding.start < cursor) continue; // skip overlaps
    if (finding.start > cursor) segments.push({ text: content.slice(cursor, finding.start) });
    segments.push({ text: content.slice(finding.start, finding.end), finding });
    cursor = finding.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments;
}

/* ------------------------------ demo data ------------------------------ */

export const DEFAULT_RULES = [
  { id: "bg-r001", code: "BG-R001", phrase: "guaranteed", severity: "High", reason: "Absolute guarantees are rarely substantiated." },
  { id: "bg-r002", code: "BG-R002", phrase: "100% risk-free", severity: "High", reason: "Absolute safety claims need evidence." },
  { id: "bg-r003", code: "BG-R003", phrase: "cures", severity: "High", reason: "Cure claims need strong, specific evidence." },
  { id: "bg-r004", code: "BG-R004", phrase: "best in the world", severity: "High", reason: "Unqualified superlatives need evidence." },
  { id: "bg-r005", code: "BG-R005", phrase: "no side effects", severity: "High", reason: "Absolute safety claims need evidence." },
  { id: "bg-r006", code: "BG-R006", phrase: "clinically proven", severity: "High", reason: "Requires a cited study or test report on file." },
  { id: "bg-r007", code: "BG-R007", phrase: "world's safest", severity: "High", reason: "Unqualified superlative; needs comparative evidence." },
];

export const DEFAULT_FACTS = {
  revision: 1,
  items: [
    {
      id: "fact-capacity",
      name: "Bottle capacity",
      dimension: "volume",
      value: 750,
      unit: "ml",
      sourceName: "AquaNova Product Spec v1.2 (FICTIONAL DEMO)",
      excerpt: "The AquaNova bottle has a capacity of 750 ml.",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "fact-material",
      name: "Material",
      dimension: "text",
      valueText: "Stainless steel",
      sourceName: "AquaNova Product Spec v1.2 (FICTIONAL DEMO)",
      excerpt: "Body is made from stainless steel.",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

export const DEMO_CONTENT =
  "Meet our new 1-litre bottle. It is clinically proven to keep every drink cold for 48 hours and is the world's safest bottle.";
