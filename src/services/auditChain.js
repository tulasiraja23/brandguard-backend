// Tamper-evident audit chain. Pure functions, no database, so it is easy to test.
// Every entry stores the SHA-256 of its own content plus the previous entry's hash.
// Editing or deleting an earlier entry breaks every hash after it.
// LIMITATION: deleting the most recent entries cannot be detected from the data alone;
// publish/record the latest head hash somewhere else to cover that case.
import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function computeHash(entry) {
  const payload = stableStringify({
    seq: entry.seq,
    organisation: String(entry.organisation),
    actor: entry.actor ? String(entry.actor) : null,
    action: entry.action,
    entityType: entry.entityType || "",
    entityId: entry.entityId || "",
    details: entry.details ?? {},
    prevHash: entry.prevHash,
    createdAt: new Date(entry.createdAt).toISOString(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

// entries must be sorted by seq ascending.
export function verifyChain(entries) {
  let prevHash = GENESIS_HASH;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.seq !== index + 1) {
      return { valid: false, checked: index, brokenAt: entry.seq, reason: "Missing or out-of-order entry (sequence gap).", headHash: null };
    }
    if (entry.prevHash !== prevHash) {
      return { valid: false, checked: index, brokenAt: entry.seq, reason: "Link to the previous entry does not match.", headHash: null };
    }
    if (computeHash(entry) !== entry.hash) {
      return { valid: false, checked: index, brokenAt: entry.seq, reason: "Entry content does not match its hash (it was modified).", headHash: null };
    }
    prevHash = entry.hash;
  }
  return { valid: true, checked: entries.length, brokenAt: null, reason: null, headHash: prevHash };
}
