import mongoose from "mongoose";

const ruleVersionSchema = new mongoose.Schema(
  {
    version: Number,
    phrase: String,
    severity: String,
    reason: String,
    active: Boolean,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: Date,
  },
  { _id: false }
);

const ruleSchema = new mongoose.Schema(
  {
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: "Organisation", required: true, index: true },
    code: { type: String, required: true },
    phrase: { type: String, required: true, trim: true, maxlength: 200 },
    severity: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    version: { type: Number, default: 1 },
    active: { type: Boolean, default: true }, // rules are never hard-deleted, so history is kept
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    history: { type: [ruleVersionSchema], default: [] }, // previous versions
  },
  { timestamps: true }
);
ruleSchema.index({ organisation: 1, code: 1 }, { unique: true });

export default mongoose.model("Rule", ruleSchema);
