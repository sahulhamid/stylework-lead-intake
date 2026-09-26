import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { prisma } from "../../src/lib/prisma";
import { app, leadValue, metaPayload, postWebhook, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

let seq = 0;
// Inserts a lead directly; the read endpoints don't care how it got there.
function createLead(data: Partial<Prisma.LeadCreateInput> = {}) {
  seq += 1;
  return prisma.lead.create({
    data: {
      metaLeadId: `L-${seq}`,
      fullName: `Person ${seq}`,
      email: `person${seq}@example.com`,
      phone: `+91980000000${seq}`,
      rawPayload: { leadgen_id: `L-${seq}` },
      ...data,
    },
  });
}

describe("GET /leads", () => {
  it("returns leads newest first with pagination meta", async () => {
    await createLead({ metaLeadId: "old", createdAt: new Date("2026-09-01T10:00:00Z") });
    await createLead({ metaLeadId: "new", createdAt: new Date("2026-09-03T10:00:00Z") });
    await createLead({ metaLeadId: "mid", createdAt: new Date("2026-09-02T10:00:00Z") });

    const res = await request(app).get("/leads");

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3 });
    expect(res.body.data.map((lead: { metaLeadId: string }) => lead.metaLeadId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("leaves the raw payload out of the list", async () => {
    await createLead();

    const res = await request(app).get("/leads");

    expect(res.body.data[0]).not.toHaveProperty("rawPayload");
  });

  it("pages through leads with identical timestamps in a stable order (id tie-breaker)", async () => {
    // Inserted in shuffled id order, so only the id tie-breaker yields 5, 4, 3, 2, 1.
    const sameTime = new Date("2026-09-01T10:00:00Z");
    for (const n of [3, 1, 5, 2, 4]) {
      await createLead({ id: `00000000-0000-7000-8000-00000000000${n}`, createdAt: sameTime });
    }

    const pages = await Promise.all(
      [1, 2, 3].map((page) => request(app).get("/leads").query({ page, limit: 2 })),
    );

    const ids = pages.flatMap((res) => res.body.data.map((lead: { id: string }) => lead.id.at(-1)));
    expect(ids).toEqual(["5", "4", "3", "2", "1"]);
    expect(pages[0]?.body.meta.total).toBe(5);
  });

  it("filters by status", async () => {
    await createLead({ status: "NEW" });
    await createLead({ status: "LOST" });
    await createLead({ status: "LOST" });

    const res = await request(app).get("/leads").query({ status: "LOST" });

    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((lead: { status: string }) => lead.status === "LOST")).toBe(true);
  });

  it.each([
    ["name, any case", "PRIYA"],
    ["email, any case", "priya.s@GMAIL"],
    ["phone", "98765"],
  ])("searches by %s", async (_label, search) => {
    await createLead({ fullName: "Priya Sharma", email: "priya.s@gmail.com", phone: "+919876543210" });
    await createLead();

    const res = await request(app).get("/leads").query({ search });

    expect(res.body.data.map((lead: { fullName: string }) => lead.fullName)).toEqual([
      "Priya Sharma",
    ]);
  });

  it("combines search with the status filter", async () => {
    await createLead({ fullName: "Priya Sharma", status: "QUALIFIED" });

    const res = await request(app).get("/leads").query({ search: "priya", status: "NEW" });

    expect(res.body.meta.total).toBe(0);
  });

  it("ignores an empty search box", async () => {
    await createLead();
    await createLead();

    const res = await request(app).get("/leads").query({ search: "  " });

    expect(res.body.meta.total).toBe(2);
  });

  it("sorts by name", async () => {
    await createLead({ fullName: "Charan" });
    await createLead({ fullName: "Asha" });
    await createLead({ fullName: "Bala" });

    const res = await request(app).get("/leads").query({ sort: "fullName" });

    expect(res.body.data.map((lead: { fullName: string }) => lead.fullName)).toEqual([
      "Asha",
      "Bala",
      "Charan",
    ]);
  });

  it("returns 400 with every invalid query parameter listed", async () => {
    const res = await request(app).get("/leads").query({ limit: 500, status: "WON", sort: "email" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((issue: { path: string }) => issue.path)).toEqual([
      "limit",
      "status",
      "sort",
    ]);
  });
});

describe("GET /leads/:id", () => {
  it("returns the lead with its raw payload and activity timeline, newest first", async () => {
    await postWebhook(metaPayload(leadValue("L-1")));
    await postWebhook(metaPayload(leadValue("L-1", { field_data: [{ name: "city", values: ["Pune"] }] })));
    const { id } = await prisma.lead.findUniqueOrThrow({ where: { metaLeadId: "L-1" } });

    const res = await request(app).get(`/leads/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, metaLeadId: "L-1", city: "Pune", version: 2 });
    expect(res.body.data.rawPayload).toMatchObject({ leadgen_id: "L-1" });
    expect(res.body.data.activities.map((activity: { type: string }) => activity.type)).toEqual([
      "LEAD_UPDATED",
      "LEAD_CREATED",
    ]);
  });

  it("returns 404 for a lead that does not exist", async () => {
    const res = await request(app).get("/leads/0199a3b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an id that is not a UUID", async () => {
    const res = await request(app).get("/leads/123");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
