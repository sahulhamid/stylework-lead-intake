import { z } from "zod";

// Query Meta sends when a webhook URL is registered in the App Dashboard.
export const subscriptionQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});

// Meta IDs arrive as strings or numbers depending on the source; store them as strings.
const metaId = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);

// Envelope of a Meta webhook. Change values are validated per lead later, so one
// malformed lead can't reject the whole batch.
export const webhookPayloadSchema = z.object({
  object: z.literal("page"),
  entry: z
    .array(
      z.object({
        id: metaId,
        time: z.number(),
        changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
      }),
    )
    .min(1),
});

// One lead notification: entry[].changes[] where field === "leadgen".
export const leadgenValueSchema = z.object({
  leadgen_id: metaId,
  page_id: metaId.optional(),
  form_id: metaId.optional(),
  ad_id: metaId.optional(),
  adgroup_id: metaId.optional(),
  campaign_id: metaId.optional(),
  created_time: z.number().int().positive().optional(), // Unix seconds
  // Not sent by real Meta (lead fields come from the Graph API); accepted inline for local testing.
  field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional(),
});

export type LeadgenValue = z.output<typeof leadgenValueSchema>;
