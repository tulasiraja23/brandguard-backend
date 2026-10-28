import { Router } from "express";
import Submission from "../models/Submission.js";
import AuditLog from "../models/AuditLog.js";
import Organisation from "../models/Organisation.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { verifyChain } from "../services/auditChain.js";

const router = Router();
router.use(authenticate);

router.get("/dashboard", asyncHandler(async (req, res) => {
  const organisation = req.user.organisation;
  const org = await Organisation.findById(organisation).lean();
  const [total, pending, highRisk, staleApproved, sums, recent] = await Promise.all([
    Submission.countDocuments({ organisation }),
    Submission.countDocuments({ organisation, status: "pending" }),
    Submission.countDocuments({ organisation, status: "pending", "analysis.risk": "High" }),
    Submission.countDocuments({ organisation, status: "approved", policyRevision: { $lt: org.policyRevision } }),
    Submission.aggregate([
      { $match: { organisation } },
      { $group: { _id: null, high: { $sum: "$analysis.counts.High" }, medium: { $sum: "$analysis.counts.Medium" }, low: { $sum: "$analysis.counts.Low" } } },
    ]),
    AuditLog.find({ organisation }).sort({ seq: -1 }).limit(8).select("action actorName entityType entityId createdAt seq").lean(),
  ]);
  const s = sums[0] || { high: 0, medium: 0, low: 0 };
  res.json({
    totalAnalysed: total,
    issuesDetected: s.high + s.medium + s.low,
    issuesBySeverity: { High: s.high, Medium: s.medium, Low: s.low },
    awaitingApproval: pending,
    highRiskAwaitingReview: highRisk,
    approvedButPossiblyAffected: staleApproved,
    recentActivity: recent,
  });
}));

router.get("/audit", requireRole("reviewer", "admin"), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const entries = await AuditLog.find({ organisation: req.user.organisation }).sort({ seq: -1 }).limit(limit).lean();
  res.json({ entries });
}));

// Re-computes every hash in this organisation's chain and reports whether anything was altered.
router.get("/audit/verify", requireRole("reviewer", "admin"), asyncHandler(async (req, res) => {
  const entries = await AuditLog.find({ organisation: req.user.organisation }).sort({ seq: 1 }).lean();
  res.json(verifyChain(entries));
}));

export default router;
