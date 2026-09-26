import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { prisma } from "../../src/lib/prisma";
import { app, leadValue, metaPayload, postWebhook, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("GET /webhook/meta-lead (subscription handshake)", () => {
  const verify = (query: Record<string, string>) =>
    request(app).get("/webhook/meta-lead").query(query);

  it("echoes the challenge when the verify token matches", async () => {
    const res = await verify({
      "hub.mode": "subscribe",
      "hub.verify_token": env.META_VERIFY_TOKEN,
      "hub.challenge": "1158201444",
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe("1158201444");
  });

  it("returns 403 for a wrong verify token", async () => {
    const res = await verify({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "1158201444",
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 when the handshake parameters are missing", async () => {
    const res = await verify({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /webhook/meta-lead (lead ingestion)", () => {
  it("creates a lead and a LEAD_CREATED activity", async () => {
    const res = await postWebhook(metaPayload(leadValue("L-1")));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "received", created: 1, updated: 0, unchanged: 0, skipped: 0 });

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { metaLeadId: "L-1" },
      include: { activities: true },
    });
    expect(lead).toMatchObject({
      fullName: "Asha Rao",
      email: "asha@example.com",
      phone: "+919800000001",
      formId: "coworking-enquiry",
      status: "NEW",
      version: 1,
    });
    expect(lead.metaCreatedAt?.toISOString()).toBe("2025-09-24T07:46:40.000Z");
    expect(lead.activities).toHaveLength(1);
    expect(lead.activities[0]).toMatchObject({ type: "LEAD_CREATED", actor: "system:meta-webhook" });
  });

  it("is idempotent: the same delivery twice leaves one lead and one activity", async () => {
    await postWebhook(metaPayload(leadValue("L-1")));
    const res = await postWebhook(metaPayload(leadValue("L-1")));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 0, unchanged: 1 });
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.leadActivity.count()).toBe(1);
  });

  it("updates a changed lead and records the diff in a LEAD_UPDATED activity", async () => {
    await postWebhook(metaPayload(leadValue("L-1")));
    const changed = leadValue("L-1", {
      field_data: [
        { name: "full_name", values: ["Asha Rao"] },
        { name: "email", values: ["asha@example.com"] },
        { name: "phone_number", values: ["+919800000002"] },
      ],
    });
    const res = await postWebhook(metaPayload(changed));

    expect(res.body).toMatchObject({ updated: 1 });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { metaLeadId: "L-1" } });
    expect(lead).toMatchObject({ phone: "+919800000002", version: 2 });

    const update = await prisma.leadActivity.findFirstOrThrow({ where: { type: "LEAD_UPDATED" } });
    expect(update.changes).toEqual({ phone: { old: "+919800000001", new: "+919800000002" } });
  });

  it("creates exactly one lead when the same lead arrives concurrently", async () => {
    const deliveries = Array.from({ length: 10 }, () => postWebhook(metaPayload(leadValue("L-1"))));
    const responses = await Promise.all(deliveries);

    expect(responses.every((res) => res.status === 200)).toBe(true);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.leadActivity.count()).toBe(1);
  });

  it("processes a batch: saves valid leads, skips malformed ones, ignores other fields", async () => {
    const payload = metaPayload(leadValue("L-1"), leadValue("L-2"), { form_id: "no-leadgen-id" });
    payload.entry[0]?.changes.push({ field: "feed", value: { post_id: "123" } });

    const res = await postWebhook(payload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, skipped: 1 });
    expect(await prisma.lead.count()).toBe(2);
  });

  it("rejects a request without a signature and saves nothing", async () => {
    const res = await request(app)
      .post("/webhook/meta-lead")
      .send(metaPayload(leadValue("L-1")));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(await prisma.lead.count()).toBe(0);
  });

  it("rejects a request signed with the wrong secret", async () => {
    const res = await postWebhook(metaPayload(leadValue("L-1")), "not-the-real-app-secret");

    expect(res.status).toBe(401);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("returns 400 for a body that is not a Meta page event", async () => {
    const res = await postWebhook({ hello: "world" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await request(app)
      .post("/webhook/meta-lead")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("lead_activities (append-only audit trail)", () => {
  it("rejects UPDATE and DELETE at the database level", async () => {
    await postWebhook(metaPayload(leadValue("L-1")));

    await expect(prisma.$executeRaw`UPDATE lead_activities SET actor = 'someone'`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM lead_activities`).rejects.toThrow();
    expect(await prisma.leadActivity.count()).toBe(1);
  });
});
