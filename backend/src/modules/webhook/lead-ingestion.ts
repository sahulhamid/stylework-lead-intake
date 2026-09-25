import { Prisma } from "../../generated/prisma/client";
import { ConflictError } from "../../lib/errors";
import { diffLead } from "../leads/lead-diff";
import {
  createLeadWithActivity,
  findLeadByMetaId,
  type LeadInput,
  updateLeadWithActivity,
} from "../leads/leads.repository";
import type { LeadDataProvider } from "./lead-data-provider";
import type { LeadgenValue } from "./webhook.schemas";

const ACTOR = "system:meta-webhook";

export type IngestResult = "created" | "updated" | "unchanged";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// Idempotent upsert of one Meta lead. Safe to repeat (Meta retries): an identical
// delivery is a no-op, a changed one records a LEAD_UPDATED diff.
export async function ingestLead(
  lead: LeadgenValue,
  rawValue: unknown,
  provider: LeadDataProvider,
): Promise<IngestResult> {
  const details = await provider.getLeadDetails(lead);
  const incoming: LeadInput = {
    metaLeadId: lead.leadgen_id,
    formId: lead.form_id ?? null,
    adId: lead.ad_id ?? null,
    campaignId: lead.campaign_id ?? null,
    pageId: lead.page_id ?? null,
    metaCreatedAt: lead.created_time ? new Date(lead.created_time * 1000) : null,
    ...details,
    // rawValue came from JSON.parse, so it is valid JSON.
    rawPayload: rawValue as Prisma.InputJsonValue,
  };

  let existing = await findLeadByMetaId(incoming.metaLeadId);
  if (!existing) {
    try {
      await createLeadWithActivity(incoming, ACTOR);
      return "created";
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // A concurrent delivery of the same lead created it first: continue as an update.
      existing = await findLeadByMetaId(incoming.metaLeadId);
      if (!existing) throw err;
    }
  }

  const changes = diffLead(existing, incoming);
  if (Object.keys(changes).length === 0) return "unchanged";

  const updated = await updateLeadWithActivity(
    existing.id,
    existing.version,
    incoming,
    changes,
    ACTOR,
  );
  if (!updated) throw new ConflictError(`Lead ${incoming.metaLeadId} changed during ingestion`);
  return "updated";
}
