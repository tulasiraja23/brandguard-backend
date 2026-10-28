import { Router } from "express";
import { z } from "zod";
import Submission, { CONTENT_TYPES } from "../models/Submission.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { config } from "../config/env.js";
import { HttpError, asyncHandler, checkObjectId, validate } from "../utils/http.js";
import { recordAudit } from "../services/audit.js";
import { loadPolicy } from "../services/policy.js";
import { runAnalysis } from "../services/analysisService.js";

const router = Router();
router.use(authenticate);

const createBody = z.object({
  content: z.string().trim().min(1, "Enter some content to analyse.").max(10000, "Content is too long (10,000 characters max)."),
  contentType: z.enum(CONTENT_TYPES).default("general"),
});
const editBody = z.object({
  revisedText: z.string().max(10000).optional(),
  findingDecisions: z.record(z.string().max(60), z.enum(["accepted", "rejected"])).optional(),
});
const decisionBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  finalText: z.string().trim().max(10000).optional(),
  comment: z.string().trim().max(1000).default(""),
});

const isReviewer = (user) => user.role === "reviewer" || user.role === "admin";
const event = (user, action, comment = "") => ({ at: new Date(), by: user._id, byName: user.name, role: user.role, action, comment });

// Adds `stale`: approved rules/facts changed since this content was checked.
const present = (doc, policyRevision) => ({ ...doc.toObject(), stale: doc.policyRevision < policyRevision });

// Writers see only their own submissions. Reviewers and admins see the whole organisation.
// Always scoped by organisation, so another organisation's ids simply return 404.
async function findAccessible(req) {
  checkObjectId(req.params.id);
  const filter = { _id: req.params.id, organisation: req.user.organisation };
  if (!isReviewer(req.user)) filter.createdBy = req.user._id;
  const submission = await Submission.findOne(filter);
  if (!submission) throw new HttpError(404, "Content not found.");
  return submission;
}

async function createAnalysed({ req, content, contentType, recheckOf }) {
  const { org, rules, facts } = await loadPolicy(req.user.organisation);
  const result = await runAnalysis({ content, contentType, rules, facts });
  const submission = await Submission.create({
    organisation: req.user.organisation,
    createdBy: req.user._id,
    contentType,
    content,
    analysis: {
      findings: result.findings, risk: result.risk, riskReason: result.riskReason,
      counts: result.counts, aiMode: result.aiMode, aiNote: result.aiNote,
    },
    revisedText: result.revisedText,
    policyRevision: org.policyRevision,
    recheckOf,
    events: [event(req.user, recheckOf ? "Re-checked against current rules and facts" : "Analysed")],
  });
  await recordAudit({
    organisation: req.user.organisation, user: req.user,
    action: recheckOf ? "content.rechecked" : "content.analysed",
    entityType: "Submission", entityId: submission._id,
    details: { risk: result.risk, counts: result.counts, aiMode: result.aiMode, policyRevision: org.policyRevision },
  });
  return { submission, policyRevision: org.policyRevision };
}

router.post("/submissions", validate(createBody), asyncHandler(async (req, res) => {
  const { submission, policyRevision } = await createAnalysed({ req, ...req.body });
  res.status(201).json({ submission: present(submission, policyRevision) });
}));

router.get("/submissions", asyncHandler(async (req, res) => {
  const filter = { organisation: req.user.organisation };
  if (!isReviewer(req.user)) filter.createdBy = req.user._id;
  if (["analysed", "pending", "approved", "rejected"].includes(req.query.status)) filter.status = req.query.status;
  const [docs, loaded] = await Promise.all([
    Submission.find(filter).sort({ createdAt: -1 }).limit(100),
    loadPolicy(req.user.organisation),
  ]);
  res.json({ submissions: docs.map((d) => present(d, loaded.org.policyRevision)) });
}));

router.get("/submissions/:id", asyncHandler(async (req, res) => {
  const submission = await findAccessible(req);
  const { org } = await loadPolicy(req.user.organisation);
  res.json({ submission: present(submission, org.policyRevision) });
}));

// Writer: edit the suggested rewrite and accept/reject individual suggestions (only before submitting).
router.patch("/submissions/:id", validate(editBody), asyncHandler(async (req, res) => {
  const submission = await findAccessible(req);
  if (String(submission.createdBy) !== String(req.user._id)) throw new HttpError(403, "Only the author can edit this content.");
  if (submission.status !== "analysed") throw new HttpError(409, "This content has already been submitted for review.");
  if (req.body.revisedText !== undefined) submission.revisedText = req.body.revisedText;
  if (req.body.findingDecisions) {
    const known = new Set(submission.analysis.findings.map((f) => f.id));
    const decisions = { ...submission.findingDecisions };
    for (const [id, value] of Object.entries(req.body.findingDecisions)) if (known.has(id)) decisions[id] = value;
    submission.findingDecisions = decisions;
    submission.markModified("findingDecisions");
  }
  await submission.save();
  const { org } = await loadPolicy(req.user.organisation);
  res.json({ submission: present(submission, org.policyRevision) });
}));

router.post("/submissions/:id/submit", asyncHandler(async (req, res) => {
  const submission = await findAccessible(req);
  if (String(submission.createdBy) !== String(req.user._id)) throw new HttpError(403, "Only the author can submit this content.");
  const updated = await Submission.findOneAndUpdate(
    { _id: submission._id, organisation: req.user.organisation, status: "analysed" },
    { status: "pending", $push: { events: event(req.user, "Submitted for human review") } },
    { new: true }
  );
  if (!updated) throw new HttpError(409, "This content has already been submitted.");
  await recordAudit({ organisation: req.user.organisation, user: req.user, action: "content.submitted", entityType: "Submission", entityId: updated._id, details: { risk: updated.analysis.risk } });
  const { org } = await loadPolicy(req.user.organisation);
  res.json({ submission: present(updated, org.policyRevision) });
}));

// Creates a NEW analysis of the same text under the current rules and facts. The old record stays untouched.
router.post("/submissions/:id/recheck", asyncHandler(async (req, res) => {
  const original = await findAccessible(req);
  const { submission, policyRevision } = await createAnalysed({
    req, content: original.content, contentType: original.contentType, recheckOf: original._id,
  });
  res.status(201).json({ submission: present(submission, policyRevision) });
}));

router.post("/submissions/:id/decision", requireRole("reviewer", "admin"), validate(decisionBody), asyncHandler(async (req, res) => {
  const submission = await findAccessible(req);
  const { decision, comment } = req.body;

  if (!config.allowSelfApproval && String(submission.createdBy) === String(req.user._id)) {
    throw new HttpError(403, "You cannot approve or reject your own content. Ask another reviewer.");
  }
  if ((decision === "rejected" || submission.analysis.risk === "High") && !comment) {
    throw new HttpError(400, "A comment is required for rejections and for High-risk content.");
  }
  const finalText = (req.body.finalText || submission.revisedText || submission.content).trim();

  // Atomic: only a still-pending item can be decided, so two reviewers cannot both decide it.
  const updated = await Submission.findOneAndUpdate(
    { _id: submission._id, organisation: req.user.organisation, status: "pending" },
    { status: decision, finalText, $push: { events: event(req.user, decision === "approved" ? "Approved" : "Rejected", comment) } },
    { new: true }
  );
  if (!updated) throw new HttpError(409, "This content is not awaiting review (it may already have been decided).");

  await recordAudit({
    organisation: req.user.organisation, user: req.user, action: `content.${decision}`,
    entityType: "Submission", entityId: updated._id,
    details: { risk: updated.analysis.risk, comment, editedByReviewer: finalText !== (submission.revisedText || "").trim() },
  });
  const { org } = await loadPolicy(req.user.organisation);
  res.json({ submission: present(updated, org.policyRevision) });
}));

export default router;
