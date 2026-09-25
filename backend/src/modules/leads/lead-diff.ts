import type { Lead } from "../../generated/prisma/client";
import type { LeadInput } from "./leads.repository";

// Fields that can change when Meta re-delivers a lead. rawPayload is excluded: it is a
// debugging copy, not lead data.
const TRACKED_FIELDS = [
  "formId",
  "adId",
  "campaignId",
  "pageId",
  "metaCreatedAt",
  "fullName",
  "email",
  "phone",
  "city",
  "customFields",
] as const;

type ChangeValue = string | null | Record<string, string>;
export type LeadChanges = Record<string, { old: ChangeValue; new: ChangeValue }>;

// A form of the value that compares reliably: dates as ISO strings, objects with sorted
// keys (Postgres JSONB does not preserve key order).
function comparable(value: unknown): ChangeValue {
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  }
  return typeof value === "string" ? value : null;
}

function isEmpty(value: ChangeValue): boolean {
  return value === null || (typeof value === "object" && Object.keys(value).length === 0);
}

// Field-level diff between the stored lead and incoming data. Empty incoming values are
// not changes, so a delivery without details never erases what we already have.
export function diffLead(existing: Lead, incoming: LeadInput): LeadChanges {
  const changes: LeadChanges = {};
  for (const field of TRACKED_FIELDS) {
    const next = comparable(incoming[field]);
    if (isEmpty(next)) continue;
    const prev = comparable(existing[field]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) changes[field] = { old: prev, new: next };
  }
  return changes;
}
