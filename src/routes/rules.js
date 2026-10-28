import { Router } from "express";
import { z } from "zod";
import Rule from "../models/Rule.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, checkObjectId, validate } from "../utils/http.js";
import { recordAudit } from "../services/audit.js";
import { bumpPolicyRevision } from "../services/policy.js";

const router = Router();
router.use(authenticate);

const ruleBody = z.object({
  phrase: z.string().trim().min(1, "Enter a phrase.").max(200),
  severity: z.enum(["High", "Medium", "Low"]).default("Medium"),
  reason: z.string().trim().max(500).default(""),
});

async function nextCode(organisation) {
  const codes = await Rule.find({ organisation }).select("code").lean();
  const highest = codes.reduce((max, r) => Math.max(max, Number(r.code.replace(/\D/g, "")) || 0), 0);
  return `BG-R${String(highest + 1).padStart(3, "0")}`;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const samePhrase = (organisation, phrase, exceptId) =>
  Rule.findOne({
    organisation, active: true, phrase: new RegExp(`^${escape(phrase)}$`, "i"),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

router.get("/rules", asyncHandler(async (req, res) => {
  const filter = { organisation: req.user.organisation };
  if (req.query.includeInactive !== "true") filter.active = true;
  res.json({ rules: await Rule.find(filter).sort({ code: 1 }) });
}));

router.post("/rules", requireRole("reviewer", "admin"), validate(ruleBody), asyncHandler(async (req, res) => {
  const organisation = req.user.organisation;
  if (await samePhrase(organisation, req.body.phrase)) throw new HttpError(409, "That rule already exists.");
  const rule = await Rule.create({ ...req.body, organisation, code: await nextCode(organisation), createdBy: req.user._id, updatedBy: req.user._id });
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "rule.created", entityType: "Rule", entityId: rule._id, details: { code: rule.code, phrase: rule.phrase, severity: rule.severity, policyRevision: revision } });
  res.status(201).json({ rule, policyRevision: revision });
}));

router.put("/rules/:id", requireRole("reviewer", "admin"), validate(ruleBody), asyncHandler(async (req, res) => {
  checkObjectId(req.params.id);
  const organisation = req.user.organisation;
  const rule = await Rule.findOne({ _id: req.params.id, organisation });
  if (!rule) throw new HttpError(404, "Rule not found.");
  if (await samePhrase(organisation, req.body.phrase, rule._id)) throw new HttpError(409, "Another active rule already uses that phrase.");
  rule.history.push({ version: rule.version, phrase: rule.phrase, severity: rule.severity, reason: rule.reason, active: rule.active, changedBy: rule.updatedBy, changedAt: rule.updatedAt });
  Object.assign(rule, req.body, { version: rule.version + 1, updatedBy: req.user._id });
  await rule.save();
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "rule.updated", entityType: "Rule", entityId: rule._id, details: { code: rule.code, version: rule.version, policyRevision: revision } });
  res.json({ rule, policyRevision: revision });
}));

// Soft delete: the rule stops being applied but its history is kept.
router.delete("/rules/:id", requireRole("reviewer", "admin"), asyncHandler(async (req, res) => {
  checkObjectId(req.params.id);
  const organisation = req.user.organisation;
  const rule = await Rule.findOne({ _id: req.params.id, organisation, active: true });
  if (!rule) throw new HttpError(404, "Rule not found.");
  rule.history.push({ version: rule.version, phrase: rule.phrase, severity: rule.severity, reason: rule.reason, active: true, changedBy: rule.updatedBy, changedAt: rule.updatedAt });
  Object.assign(rule, { active: false, version: rule.version + 1, updatedBy: req.user._id });
  await rule.save();
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "rule.deactivated", entityType: "Rule", entityId: rule._id, details: { code: rule.code, policyRevision: revision } });
  res.json({ rule, policyRevision: revision });
}));

export default router;
