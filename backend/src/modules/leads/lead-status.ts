import type { LeadStatus } from "../../generated/prisma/enums";

// Allowed next statuses. CONVERTED is final (handed off to booking); LOST can be
// re-engaged. Any move not listed, including to the same status, is invalid.
const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["CONVERTED", "LOST"],
  CONVERTED: [],
  LOST: ["CONTACTED"],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: LeadStatus): readonly LeadStatus[] {
  return TRANSITIONS[from];
}
