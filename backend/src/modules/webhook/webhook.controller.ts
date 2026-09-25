import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { ForbiddenError } from "../../lib/errors";
import { parseInput } from "../../lib/validation";
import { InlineLeadDataProvider } from "./lead-data-provider";
import { ingestLead } from "./lead-ingestion";
import {
  leadgenValueSchema,
  subscriptionQuerySchema,
  webhookPayloadSchema,
} from "./webhook.schemas";

const leadDataProvider = new InlineLeadDataProvider();

// Meta's one-time handshake: echo hub.challenge if the verify token matches ours.
export const verifySubscription: RequestHandler = (req, res) => {
  const query = parseInput(subscriptionQuerySchema, req.query);
  if (query["hub.verify_token"] !== env.META_VERIFY_TOKEN) {
    throw new ForbiddenError("Verify token does not match");
  }
  res.status(200).type("text/plain").send(query["hub.challenge"]);
};

// Receives lead notifications from Meta. Malformed leads are skipped (retrying can't fix
// them); unexpected errors propagate as 5xx so Meta retries, which ingestLead makes safe.
export const receiveLead: RequestHandler = async (req, res) => {
  const payload = parseInput(webhookPayloadSchema, req.body);
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0 };

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;

      const parsed = leadgenValueSchema.safeParse(change.value);
      if (!parsed.success) {
        req.log.warn(
          { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
          "skipping malformed lead",
        );
        summary.skipped += 1;
        continue;
      }

      const result = await ingestLead(parsed.data, change.value, leadDataProvider);
      summary[result] += 1;
      req.log.info({ metaLeadId: parsed.data.leadgen_id, result }, "lead ingested");
    }
  }

  res.status(200).json({ status: "received", ...summary });
};
