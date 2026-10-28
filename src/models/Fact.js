import mongoose from "mongoose";

const factVersionSchema = new mongoose.Schema(
  {
    version: Number,
    name: String,
    dimension: String,
    value: Number,
    unit: String,
    valueText: String,
    sourceName: String,
    excerpt: String,
    active: Boolean,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: Date,
  },
  { _id: false }
);

const factSchema = new mongoose.Schema(
  {
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: "Organisation", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dimension: { type: String, enum: ["volume", "mass", "time", "length", "text"], required: true },
    value: Number,
    unit: String,
    valueText: String,
    sourceName: { type: String, required: true, trim: true, maxlength: 200 },
    excerpt: { type: String, required: true, trim: true, maxlength: 1000 },
    version: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    history: { type: [factVersionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Fact", factSchema);
