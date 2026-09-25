import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../lib/errors";
import { verifySignature } from "./signature";

// Rejects any webhook POST not signed by Meta with our app secret.
export const requireMetaSignature: RequestHandler = (req, _res, next) => {
  const valid = verifySignature(req.rawBody, req.get("x-hub-signature-256"), env.META_APP_SECRET);
  if (!valid) {
    throw new UnauthorizedError(
      "Missing or invalid X-Hub-Signature-256 header. See README > Sending a test lead.",
    );
  }
  next();
};
