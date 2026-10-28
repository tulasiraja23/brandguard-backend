import { analyzeContent, buildRewrite } from "./analyzer.js";
import { aiReview } from "./ai.js";

const RANK = { High: 3, Medium: 2, Low: 1, Info: 0 };

// Text that tries to give instructions to an AI reviewer. Submitted content is untrusted, so this is flagged, never obeyed.
const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions?|prompts?|rules?)/gi,
  /disregard (all |any |the )?(previous|prior|above|system)[^.]{0,30}/gi,
  /(approve|mark|label|classify) (this|the) (content|text|submission|post)[^.]{0,40}(approved|safe|compliant|no issues)/gi,
  /you are now (a|an|the) [^.]{0,40}/gi,
  /\b(reveal|print|show) (your |the )?system prompt\b/gi,
  /<\/?(system|assistant|instructions?)>/gi,
];

function injectionFindings(content) {
  const found = [];
  for (const pattern of INJECTION_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      found.push({
        id: `sec-${match.index}`,
        ruleId: "BG-SEC-001",
        category: "security",
        severity: "High",
        title: "Possible prompt-injection text",
        detail:
          "This text reads like an instruction aimed at an AI reviewer. Submitted content is treated as untrusted data, so it was NOT followed.",
        reason: "Content that tries to steer the review system should be examined by a person before anything is approved.",
        start: match.index,
        matchedText: match[0],
        end: match.index + match[0].length,
        source: "rule",
        verdict: null,
        evidence: null,
        suggestion: "Remove the instruction-like text and check where this content came from.",
        replacement: "",
      });
    }
  }
  return found;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

export function summarise(findings) {
  const actionable = findings.filter((f) => f.severity !== "Info");
  const top = actionable[0];
  const risk = top ? top.severity : "None";
  const same = actionable.filter((f) => f.severity === risk).length;
  return {
    risk, // highest severity found, never an averaged score
    riskReason: top
      ? `${same} ${risk}-severity finding${same > 1 ? "s" : ""}, e.g. ${top.title}. Risk levels help prioritise review; they are not a legal determination.`
      : "No issues were found by the configured rules, facts and AI step. This does not guarantee compliance.",
    counts: {
      High: findings.filter((f) => f.severity === "High").length,
      Medium: findings.filter((f) => f.severity === "Medium").length,
      Low: findings.filter((f) => f.severity === "Low").length,
      supported: findings.filter((f) => f.verdict === "supported").length,
    },
  };
}

// rules/facts are plain objects in the shape analyzer.js expects.
export async function runAnalysis({ content, contentType, rules, facts }) {
  const base = analyzeContent(content, rules, facts).findings;
  const security = injectionFindings(content);
  const ai = await aiReview({ content, contentType });

  const deterministic = [...base, ...security];
  // Keep deterministic findings; drop AI/demo findings that repeat the same span.
  const aiExtra = ai.findings.filter((f) => !deterministic.some((d) => overlaps(f, d)));

  const findings = [...deterministic, ...aiExtra].sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || a.start - b.start
  );

  return {
    findings,
    ...summarise(findings),
    aiMode: ai.mode,
    aiNote: ai.note,
    revisedText: buildRewrite(content, findings),
  };
}
