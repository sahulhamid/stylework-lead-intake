import { z } from "zod";
import { LeadStatus } from "../../generated/prisma/enums";

// "-" prefix = descending. Listed explicitly so an invalid value gets a 400 naming the options.
const SORT_OPTIONS = [
  "createdAt",
  "-createdAt",
  "updatedAt",
  "-updatedAt",
  "fullName",
  "-fullName",
] as const;

// Query of GET /leads. Query values arrive as strings, so numbers are coerced.
export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LeadStatus).optional(),
  // An empty search box (?search=) means no search, not an error.
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  sort: z.enum(SORT_OPTIONS).default("-createdAt"),
});

// :id must be a UUID, otherwise Postgres rejects the query and it would surface as a 500.
export const leadIdParamsSchema = z.object({ id: z.uuid() });

// Body of PATCH /leads/:id/status. version is the lead version the client last saw: if the
// lead changed since (another user, a webhook update), the update is rejected with 409.
export const updateStatusBodySchema = z.object({
  status: z.enum(LeadStatus),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
  version: z.number().int().positive(),
});

export type ListLeadsQuery = z.output<typeof listLeadsQuerySchema>;
export type UpdateStatusBody = z.output<typeof updateStatusBodySchema>;
