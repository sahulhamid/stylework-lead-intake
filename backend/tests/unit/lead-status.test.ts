import { describe, expect, it } from "vitest";
import { LeadStatus } from "../../src/generated/prisma/enums";
import { canTransition, nextStatuses } from "../../src/modules/leads/lead-status";

type Move = [from: LeadStatus, to: LeadStatus];

// The lifecycle, written out independently of the implementation.
const ALLOWED: Move[] = [
  ["NEW", "CONTACTED"],
  ["NEW", "LOST"],
  ["CONTACTED", "QUALIFIED"],
  ["CONTACTED", "LOST"],
  ["QUALIFIED", "CONVERTED"],
  ["QUALIFIED", "LOST"],
  ["LOST", "CONTACTED"],
];

// Every other pair of statuses, same-status moves included (built from the enum, so a
// new status is covered automatically).
const statuses = Object.values(LeadStatus);
const FORBIDDEN: Move[] = statuses
  .flatMap((from) => statuses.map((to): Move => [from, to]))
  .filter(([from, to]) => !ALLOWED.some(([f, t]) => f === from && t === to));

describe("canTransition", () => {
  it.each(ALLOWED)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(FORBIDDEN)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("lists the valid moves for the status dropdown", () => {
    expect(nextStatuses("QUALIFIED")).toEqual(["CONVERTED", "LOST"]);
  });

  it("offers nothing once a lead is converted", () => {
    expect(nextStatuses("CONVERTED")).toEqual([]);
  });
});
