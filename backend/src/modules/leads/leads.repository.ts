import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

// Lead columns written by ingestion (everything except id, status, version, timestamps).
export type LeadInput = {
  metaLeadId: string;
  formId: string | null;
  adId: string | null;
  campaignId: string | null;
  pageId: string | null;
  metaCreatedAt: Date | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  customFields: Record<string, string>;
  rawPayload: Prisma.InputJsonValue;
};

export function findLeadByMetaId(metaLeadId: string) {
  return prisma.lead.findUnique({ where: { metaLeadId } });
}

// Nested create: Prisma inserts the lead and its first activity in one transaction.
export function createLeadWithActivity(data: LeadInput, actor: string) {
  return prisma.lead.create({
    data: { ...data, activities: { create: { type: "LEAD_CREATED", actor } } },
  });
}

// Updates only if the lead is still at expectedVersion (optimistic lock) and records the
// diff in the same transaction. Returns false if someone else changed the lead first.
export function updateLeadWithActivity(
  id: string,
  expectedVersion: number,
  data: LeadInput,
  changes: Prisma.InputJsonObject,
  actor: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.lead.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) return false;
    await tx.leadActivity.create({ data: { leadId: id, type: "LEAD_UPDATED", actor, changes } });
    return true;
  });
}
