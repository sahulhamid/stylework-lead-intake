import { z } from "zod";

// Query Meta sends when a webhook URL is registered in the App Dashboard.
export const subscriptionQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});
