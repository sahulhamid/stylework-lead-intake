import type { LeadStatus } from "../api/leads";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

// Created once: building an Intl formatter is relatively expensive.
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

// "2026-09-26T08:30:00.000Z" → "26 Sept 2026, 2:00 pm" in the viewer's time zone.
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
