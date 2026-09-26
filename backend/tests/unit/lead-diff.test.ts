import { describe, expect, it } from "vitest";
import type { Lead } from "../../src/generated/prisma/client";
import { diffLead } from "../../src/modules/leads/lead-diff";
import type { LeadInput } from "../../src/modules/leads/leads.repository";

const submittedAt = new Date("2026-09-20T10:00:00.000Z");

// Incoming data for a lead; each test overrides only what it is about.
function incoming(overrides: Partial<LeadInput> = {}): LeadInput {
  return {
    metaLeadId: "L-1",
    formId: "form-1",
    adId: "ad-1",
    campaignId: "campaign-1",
    pageId: "page-1",
    metaCreatedAt: submittedAt,
    fullName: "Asha Rao",
    email: "asha@example.com",
    phone: "+919800000001",
    city: "Bengaluru",
    customFields: { team_size: "5", budget: "20000" },
    rawPayload: { leadgen_id: "L-1" },
    ...overrides,
  };
}

// The same lead as stored in the DB, plus the columns ingestion never writes.
function stored(overrides: Partial<Lead> = {}): Lead {
  return {
    ...incoming(),
    rawPayload: { leadgen_id: "L-1" },
    id: "lead-uuid",
    status: "NEW",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("diffLead", () => {
  it("returns no changes for an identical re-delivery", () => {
    expect(diffLead(stored(), incoming())).toEqual({});
  });

  it("records old and new values for a changed field", () => {
    expect(diffLead(stored(), incoming({ phone: "+919800000002" }))).toEqual({
      phone: { old: "+919800000001", new: "+919800000002" },
    });
  });

  it("records a field filled in for the first time", () => {
    expect(diffLead(stored({ city: null }), incoming())).toEqual({
      city: { old: null, new: "Bengaluru" },
    });
  });

  it("never erases stored data when incoming values are empty", () => {
    const empty = incoming({ fullName: null, email: null, phone: null, city: null, customFields: {} });
    expect(diffLead(stored(), empty)).toEqual({});
  });

  it("ignores key order in custom fields (Postgres JSONB reorders keys)", () => {
    const reordered = incoming({ customFields: { budget: "20000", team_size: "5" } });
    expect(diffLead(stored(), reordered)).toEqual({});
  });

  it("records the whole custom fields object when an answer changes", () => {
    const changed = incoming({ customFields: { team_size: "8", budget: "20000" } });
    expect(diffLead(stored(), changed)).toEqual({
      customFields: {
        old: { budget: "20000", team_size: "5" },
        new: { budget: "20000", team_size: "8" },
      },
    });
  });

  it("compares dates by instant, not by object identity", () => {
    const sameInstant = incoming({ metaCreatedAt: new Date(submittedAt.getTime()) });
    expect(diffLead(stored(), sameInstant)).toEqual({});

    const later = incoming({ metaCreatedAt: new Date("2026-09-21T10:00:00.000Z") });
    expect(diffLead(stored(), later)).toEqual({
      metaCreatedAt: { old: "2026-09-20T10:00:00.000Z", new: "2026-09-21T10:00:00.000Z" },
    });
  });

  it("ignores raw payload differences (a debugging copy, not lead data)", () => {
    expect(diffLead(stored(), incoming({ rawPayload: { leadgen_id: "L-1", extra: true } }))).toEqual({});
  });
});
