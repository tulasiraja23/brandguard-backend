// Creates the FICTIONAL AquaNova demo organisation. Safe to re-run: it replaces the previous demo data.
import bcrypt from "bcryptjs";
import { assertConfig, config } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import Organisation from "./models/Organisation.js";
import User from "./models/User.js";
import Rule from "./models/Rule.js";
import Fact from "./models/Fact.js";
import Submission from "./models/Submission.js";
import AuditLog from "./models/AuditLog.js";
import { DEFAULT_RULES, DEFAULT_FACTS } from "./services/analyzer.js";
import { recordAudit } from "./services/audit.js";

assertConfig();
await connectDb();

const existing = await Organisation.find({ isDemo: true }).select("_id");
const ids = existing.map((o) => o._id);
await Promise.all([Submission, Rule, Fact, User, AuditLog].map((m) => m.deleteMany({ organisation: { $in: ids } })));
await Organisation.deleteMany({ _id: { $in: ids } });

const org = await Organisation.create({ name: "AquaNova (FICTIONAL DEMO)", isDemo: true });
const passwordHash = await bcrypt.hash(config.seedPassword, config.bcryptRounds);
const [admin] = await User.create([
  { name: "Asha Admin", email: "admin@aquanova.demo", role: "admin", organisation: org._id, passwordHash },
  { name: "Wren Writer", email: "writer@aquanova.demo", role: "writer", organisation: org._id, passwordHash },
  { name: "Ravi Reviewer", email: "reviewer@aquanova.demo", role: "reviewer", organisation: org._id, passwordHash },
]);

await Rule.insertMany(DEFAULT_RULES.map((r) => ({ organisation: org._id, code: r.code, phrase: r.phrase, severity: r.severity, reason: r.reason, createdBy: admin._id, updatedBy: admin._id })));
await Fact.insertMany(
  DEFAULT_FACTS.items.map((f) => ({
    organisation: org._id, name: f.name, dimension: f.dimension, value: f.value, unit: f.unit, valueText: f.valueText,
    sourceName: f.sourceName, excerpt: f.excerpt, createdBy: admin._id, updatedBy: admin._id,
  }))
);
await recordAudit({ organisation: org._id, user: admin, action: "demo.seeded", entityType: "Organisation", entityId: org._id, details: { note: "Fictional demonstration data" } });

console.log("Seeded FICTIONAL demo organisation 'AquaNova'. Sign in with (password from SEED_PASSWORD):");
console.log("  admin@aquanova.demo    (admin)");
console.log("  writer@aquanova.demo   (writer)");
console.log("  reviewer@aquanova.demo (reviewer)");
await disconnectDb();
