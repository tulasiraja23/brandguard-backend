import AuditLog from "../models/AuditLog.js";
import { GENESIS_HASH, computeHash } from "./auditChain.js";

// Appends one entry to the organisation's hash chain. Retries if two requests race for the same seq.
export async function recordAudit({ organisation, user = null, action, entityType = "", entityId = "", details = {} }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await AuditLog.findOne({ organisation }).sort({ seq: -1 }).lean();
    const entry = {
      organisation,
      seq: last ? last.seq + 1 : 1,
      actor: user ? user._id : null,
      actorName: user ? user.name : "system",
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      details,
      prevHash: last ? last.hash : GENESIS_HASH,
      createdAt: new Date(),
    };
    entry.hash = computeHash(entry);
    try {
      return await AuditLog.create(entry);
    } catch (error) {
      if (error?.code !== 11000) throw error; // duplicate seq: someone else wrote first, retry
    }
  }
  throw new Error("Could not append to the audit log after several attempts.");
}
