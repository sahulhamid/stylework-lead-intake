import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { ForbiddenError } from "../../lib/errors";
import { parseInput } from "../../lib/validation";
import { subscriptionQuerySchema } from "./webhook.schemas";

// Meta's one-time handshake: echo hub.challenge if the verify token matches ours.
export const verifySubscription: RequestHandler = (req, res) => {
  const query = parseInput(subscriptionQuerySchema, req.query);
  if (query["hub.verify_token"] !== env.META_VERIFY_TOKEN) {
    throw new ForbiddenError("Verify token does not match");
  }
  res.status(200).type("text/plain").send(query["hub.challenge"]);
};

// Receives lead notifications from Meta. Ingestion is added in the next step.
export const receiveLead: RequestHandler = (_req, res) => {
  res.status(200).json({ status: "received" });
};
