import type { RequestHandler } from "express";
import type { LeadStatus } from "../../generated/prisma/enums";
import { NotFoundError } from "../../lib/errors";
import { parseInput } from "../../lib/validation";
import { nextStatuses } from "./lead-status";
import { findLeads, findLeadWithActivities } from "./leads.repository";
import { leadIdParamsSchema, listLeadsQuerySchema, updateStatusBodySchema } from "./leads.schemas";
import { changeLeadStatus } from "./leads.service";

// Adds the statuses the lead can move to next, so the UI never duplicates the lifecycle rules.
function withNextStatuses<T extends { status: LeadStatus }>(lead: T) {
  return { ...lead, nextStatuses: nextStatuses(lead.status) };
}

// GET /leads: one page of leads, filtered, searched and sorted.
export const listLeads: RequestHandler = async (req, res) => {
  const query = parseInput(listLeadsQuerySchema, req.query);
  const { leads, total } = await findLeads(query);
  res.json({ data: leads, meta: { page: query.page, limit: query.limit, total } });
};

// GET /leads/:id: one lead with its activity timeline.
export const getLead: RequestHandler = async (req, res) => {
  const { id } = parseInput(leadIdParamsSchema, req.params);
  const lead = await findLeadWithActivities(id);
  if (!lead) throw new NotFoundError(`Lead ${id} not found`);
  res.json({ data: withNextStatuses(lead) });
};

// PATCH /leads/:id/status: moves a lead to a new status and records it in the timeline.
export const updateLeadStatus: RequestHandler = async (req, res) => {
  const { id } = parseInput(leadIdParamsSchema, req.params);
  const body = parseInput(updateStatusBodySchema, req.body);
  const lead = await changeLeadStatus(id, body);
  res.json({ data: withNextStatuses(lead) });
};
