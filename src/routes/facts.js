import { Router } from "express";
import { z } from "zod";
import Fact from "../models/Fact.js";
import { DIMENSIONS } from "../services/analyzer.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, checkObjectId, validate } from "../utils/http.js";
import { recordAudit } from "../services/audit.js";
import { bumpPolicyRevision } from "../services/policy.js";

const router = Router();
router.use(authenticate);

const factBody = z
  .object({
    name: z.string().trim().min(1, "Enter a fact name.").max(120),
    dimension: z.enum(Object.keys(DIMENSIONS)),
    value: z.number().positive().optional(),
    unit: z.string().trim().max(20).optional(),
    valueText: z.string().trim().max(300).optional(),
    sourceName: z.string().trim().min(1, "Enter the source document name.").max(200),
    excerpt: z.string().trim().min(1, "Enter an excerpt from the source.").max(1000),
  })
  .superRefine((fact, ctx) => {
    if (fact.dimension === "text") {
      if (!fact.valueText) ctx.addIssue({ code: "custom", path: ["valueText"], message: "Enter the fact text." });
      return;
    }
    if (fact.value === undefined) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a positive number." });
    if (!DIMENSIONS[fact.dimension].units.includes(fact.unit)) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: `Unit must be one of: ${DIMENSIONS[fact.dimension].units.join(", ")}.` });
    }
  });

// Keep only the fields that belong to this dimension.
const clean = (b) => ({
  name: b.name, dimension: b.dimension, sourceName: b.sourceName, excerpt: b.excerpt,
  ...(b.dimension === "text" ? { valueText: b.valueText, value: undefined, unit: undefined } : { value: b.value, unit: b.unit, valueText: undefined }),
});
const snapshot = (f) => ({
  version: f.version, name: f.name, dimension: f.dimension, value: f.value, unit: f.unit, valueText: f.valueText,
  sourceName: f.sourceName, excerpt: f.excerpt, active: f.active, changedBy: f.updatedBy, changedAt: f.updatedAt,
});

router.get("/facts", asyncHandler(async (req, res) => {
  const filter = { organisation: req.user.organisation };
  if (req.query.includeInactive !== "true") filter.active = true;
  res.json({ facts: await Fact.find(filter).sort({ createdAt: 1 }) });
}));

router.post("/facts", requireRole("reviewer", "admin"), validate(factBody), asyncHandler(async (req, res) => {
  const organisation = req.user.organisation;
  const fact = await Fact.create({ ...clean(req.body), organisation, createdBy: req.user._id, updatedBy: req.user._id });
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "fact.created", entityType: "Fact", entityId: fact._id, details: { name: fact.name, sourceName: fact.sourceName, policyRevision: revision } });
  res.status(201).json({ fact, policyRevision: revision });
}));

router.put("/facts/:id", requireRole("reviewer", "admin"), validate(factBody), asyncHandler(async (req, res) => {
  checkObjectId(req.params.id);
  const organisation = req.user.organisation;
  const fact = await Fact.findOne({ _id: req.params.id, organisation });
  if (!fact) throw new HttpError(404, "Fact not found.");
  fact.history.push(snapshot(fact));
  fact.set({ value: undefined, unit: undefined, valueText: undefined });
  Object.assign(fact, clean(req.body), { version: fact.version + 1, updatedBy: req.user._id });
  await fact.save();
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "fact.updated", entityType: "Fact", entityId: fact._id, details: { name: fact.name, version: fact.version, policyRevision: revision } });
  res.json({ fact, policyRevision: revision });
}));

router.delete("/facts/:id", requireRole("reviewer", "admin"), asyncHandler(async (req, res) => {
  checkObjectId(req.params.id);
  const organisation = req.user.organisation;
  const fact = await Fact.findOne({ _id: req.params.id, organisation, active: true });
  if (!fact) throw new HttpError(404, "Fact not found.");
  fact.history.push(snapshot(fact));
  Object.assign(fact, { active: false, version: fact.version + 1, updatedBy: req.user._id });
  await fact.save();
  const revision = await bumpPolicyRevision(organisation);
  await recordAudit({ organisation, user: req.user, action: "fact.deactivated", entityType: "Fact", entityId: fact._id, details: { name: fact.name, policyRevision: revision } });
  res.json({ fact, policyRevision: revision });
}));

export default router;
