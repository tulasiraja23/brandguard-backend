import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: String,
    role: String,
    action: String,
    comment: { type: String, default: "" },
  },
  { _id: false }
);

export const CONTENT_TYPES = ["social", "advertisement", "email", "website", "general"];
export const STATUSES = ["analysed", "pending", "approved", "rejected"];

const submissionSchema = new mongoose.Schema(
  {
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: "Organisation", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contentType: { type: String, enum: CONTENT_TYPES, default: "general" },
    content: { type: String, required: true, maxlength: 10000 },
    analysis: {
      findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
      risk: { type: String, enum: ["High", "Medium", "Low", "None"], default: "None" },
      riskReason: String,
      counts: mongoose.Schema.Types.Mixed,
      // How the AI step ran: "claude" = real model, "demo" = labelled heuristic, "off" = not run.
      aiMode: { type: String, enum: ["claude", "demo", "off"], default: "off" },
      aiNote: String,
    },
    revisedText: { type: String, default: "" }, // AI/rule SUGGESTION, editable by the writer
    findingDecisions: { type: mongoose.Schema.Types.Mixed, default: {} }, // { findingId: "accepted" | "rejected" }
    finalText: { type: String, default: "" }, // text a human reviewer approved or rejected
    status: { type: String, enum: STATUSES, default: "analysed", index: true },
    policyRevision: { type: Number, required: true },
    recheckOf: { type: mongoose.Schema.Types.ObjectId, ref: "Submission" },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true }
);
submissionSchema.index({ organisation: 1, createdAt: -1 });

export default mongoose.model("Submission", submissionSchema);
