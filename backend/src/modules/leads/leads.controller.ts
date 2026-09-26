import type { RequestHandler } from "express";
import { NotFoundError } from "../../lib/errors";
import { parseInput } from "../../lib/validation";
import { findLeads, findLeadWithActivities } from "./leads.repository";
import { leadIdParamsSchema, listLeadsQuerySchema } from "./leads.schemas";

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
  res.json({ data: lead });
};
