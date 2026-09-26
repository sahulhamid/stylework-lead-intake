import type { LeadStatus, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { ListLeadsQuery } from "./leads.schemas";

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

export function findLeadById(id: string) {
  return prisma.lead.findUnique({ where: { id } });
}

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

export type StatusChange = {
  leadId: string;
  expectedVersion: number;
  from: LeadStatus;
  to: LeadStatus;
  note: string | undefined;
  actor: string;
};

// Changes the status only if the lead is still at expectedVersion (optimistic lock) and
// records STATUS_CHANGED in the same transaction. Returns false if the version is stale.
export function updateStatusWithActivity(change: StatusChange): Promise<boolean> {
  const { leadId, expectedVersion, from, to, note, actor } = change;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.lead.updateMany({
      where: { id: leadId, version: expectedVersion },
      data: { status: to, version: { increment: 1 } },
    });
    if (count === 0) return false;
    await tx.leadActivity.create({
      data: { leadId, type: "STATUS_CHANGED", actor, fromStatus: from, toStatus: to, note },
    });
    return true;
  });
}

// Filters for the lead list. Search matches name, email or phone, case-insensitively.
function listWhere({ status, search }: ListLeadsQuery): Prisma.LeadWhereInput {
  return {
    ...(status && { status }),
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    }),
  };
}

// "-createdAt" → [{ createdAt: "desc" }, { id: "desc" }]. id breaks ties so pages never
// overlap or skip rows when many leads share a timestamp or name.
function listOrderBy(sort: ListLeadsQuery["sort"]): Prisma.LeadOrderByWithRelationInput[] {
  const direction = sort.startsWith("-") ? "desc" : "asc";
  const field = sort.startsWith("-") ? sort.slice(1) : sort;
  return [{ [field]: direction }, { id: direction }];
}

// One page of leads plus the total matching count (for pagination). rawPayload is left
// out: the list never shows it and it is the heaviest column.
export async function findLeads(query: ListLeadsQuery) {
  const where = listWhere(query);
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: listOrderBy(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      omit: { rawPayload: true },
    }),
    prisma.lead.count({ where }),
  ]);
  return { leads, total };
}

// A lead with its audit timeline, newest first.
export function findLeadWithActivities(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: { activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
  });
}
