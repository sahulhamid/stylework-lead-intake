import { createHmac } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { prisma } from "../../src/lib/prisma";

export const app = createApp();

// Empties both tables. TRUNCATE is the only way: the append-only trigger blocks DELETE
// on lead_activities.
export async function resetDb(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE lead_activities, leads`;
}

// A Meta webhook body carrying one leadgen change per given value.
export function metaPayload(...values: object[]) {
  return {
    object: "page",
    entry: [
      {
        id: "page-1",
        time: 1758700000,
        changes: values.map((value) => ({ field: "leadgen", value })),
      },
    ],
  };
}

// A lead value with inline contact details; override any field per test.
export function leadValue(leadgenId: string, overrides: Record<string, unknown> = {}) {
  return {
    leadgen_id: leadgenId,
    form_id: "coworking-enquiry",
    created_time: 1758700000,
    field_data: [
      { name: "full_name", values: ["Asha Rao"] },
      { name: "email", values: ["asha@example.com"] },
      { name: "phone_number", values: ["+919800000001"] },
    ],
    ...overrides,
  };
}

// POSTs a body to the webhook, signed like Meta does (HMAC-SHA256 of the exact bytes sent).
export function postWebhook(payload: unknown, secret: string = env.META_APP_SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return request(app)
    .post("/webhook/meta-lead")
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", `sha256=${signature}`)
    .send(body);
}
