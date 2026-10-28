import mongoose from "mongoose";

const organisationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    isDemo: { type: Boolean, default: false },
    // Incremented whenever an approved rule or fact changes. Submissions remember the
    // revision they were checked against, so older ones can be flagged as "possibly affected".
    policyRevision: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model("Organisation", organisationSchema);
