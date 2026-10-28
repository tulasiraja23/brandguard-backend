import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: "Organisation", required: true },
  seq: { type: Number, required: true }, // 1, 2, 3 ... per organisation
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorName: { type: String, default: "system" },
  action: { type: String, required: true },
  entityType: { type: String, default: "" },
  entityId: { type: String, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
  createdAt: { type: Date, required: true },
});
auditLogSchema.index({ organisation: 1, seq: 1 }, { unique: true });

export default mongoose.model("AuditLog", auditLogSchema);
