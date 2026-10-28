import Organisation from "../models/Organisation.js";
import Rule from "../models/Rule.js";
import Fact from "../models/Fact.js";

// Call after any approved rule or fact changes. Returns the new revision number.
export async function bumpPolicyRevision(organisationId) {
  const org = await Organisation.findByIdAndUpdate(organisationId, { $inc: { policyRevision: 1 } }, { new: true });
  return org.policyRevision;
}

export async function loadPolicy(organisationId) {
  const [rules, facts, org] = await Promise.all([
    Rule.find({ organisation: organisationId, active: true }).lean(),
    Fact.find({ organisation: organisationId, active: true }).lean(),
    Organisation.findById(organisationId).lean(),
  ]);
  return {
    org,
    rules: rules.map((r) => ({ id: String(r._id), code: r.code, phrase: r.phrase, severity: r.severity, reason: r.reason })),
    facts: facts.map((f) => ({
      id: String(f._id), name: f.name, dimension: f.dimension, value: f.value, unit: f.unit,
      valueText: f.valueText, sourceName: f.sourceName, excerpt: f.excerpt, version: f.version,
    })),
  };
}
