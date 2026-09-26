import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { updateStatusWithActivity } from "../../src/modules/leads/leads.repository";
import { app, leadValue, metaPayload, postWebhook, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// Creates a lead through the webhook (status NEW, version 1) and returns its id.
async function createLead(): Promise<string> {
  await postWebhook(metaPayload(leadValue("L-1")));
  const lead = await prisma.lead.findUniqueOrThrow({ where: { metaLeadId: "L-1" } });
  return lead.id;
}

function changeStatus(id: string, body: object) {
  return request(app).patch(`/leads/${id}/status`).send(body);
}

describe("PATCH /leads/:id/status", () => {
  it("changes the status, bumps the version and records a STATUS_CHANGED activity", async () => {
    const id = await createLead();

    const res = await changeStatus(id, { status: "CONTACTED", note: "Called, interested", version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "CONTACTED",
      version: 2,
      nextStatuses: ["QUALIFIED", "LOST"],
    });
    expect(res.body.data.activities[0]).toMatchObject({
      type: "STATUS_CHANGED",
      fromStatus: "NEW",
      toStatus: "CONTACTED",
      note: "Called, interested",
      actor: "dashboard",
    });
    expect(await prisma.leadActivity.count({ where: { type: "STATUS_CHANGED" } })).toBe(1);
  });

  it("walks the full lifecycle to CONVERTED, after which no moves are offered", async () => {
    const id = await createLead();

    await changeStatus(id, { status: "CONTACTED", version: 1 });
    await changeStatus(id, { status: "QUALIFIED", version: 2 });
    const res = await changeStatus(id, { status: "CONVERTED", version: 3 });

    expect(res.body.data).toMatchObject({ status: "CONVERTED", version: 4, nextStatuses: [] });
    expect(res.body.data.activities.map((a: { toStatus: string | null }) => a.toStatus)).toEqual([
      "CONVERTED",
      "QUALIFIED",
      "CONTACTED",
      null,
    ]);
  });

  it("returns 422 with the allowed moves for a transition the lifecycle forbids", async () => {
    const id = await createLead();

    const res = await changeStatus(id, { status: "CONVERTED", version: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: "INVALID_TRANSITION",
      details: { from: "NEW", to: "CONVERTED", allowed: ["CONTACTED", "LOST"] },
    });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead).toMatchObject({ status: "NEW", version: 1 });
  });

  it("returns 422 for a move to the same status", async () => {
    const id = await createLead();

    const res = await changeStatus(id, { status: "NEW", version: 1 });

    expect(res.status).toBe(422);
  });

  it("returns 409 for a stale version and changes nothing", async () => {
    const id = await createLead();
    await changeStatus(id, { status: "LOST", note: "Not interested", version: 1 });

    // A second user still looking at version 1.
    const res = await changeStatus(id, { status: "CONTACTED", version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "CONFLICT", details: { currentVersion: 2 } });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead).toMatchObject({ status: "LOST", version: 2 });
    expect(await prisma.leadActivity.count({ where: { type: "STATUS_CHANGED" } })).toBe(1);
  });

  it("returns 409 when a webhook update landed after the client loaded the lead", async () => {
    const id = await createLead();
    await postWebhook(metaPayload(leadValue("L-1", { field_data: [{ name: "city", values: ["Pune"] }] })));

    const res = await changeStatus(id, { status: "CONTACTED", version: 1 });

    expect(res.status).toBe(409);
  });

  it("rejects a stale version inside the update itself (the atomic guard)", async () => {
    const id = await createLead();
    await changeStatus(id, { status: "CONTACTED", version: 1 });

    // A request that passed the service's early version check just before the change above
    // landed: only the version condition in the UPDATE itself can stop it.
    const updated = await updateStatusWithActivity({
      leadId: id,
      expectedVersion: 1,
      from: "NEW",
      to: "LOST",
      note: undefined,
      actor: "dashboard",
    });

    expect(updated).toBe(false);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead).toMatchObject({ status: "CONTACTED", version: 2 });
    expect(await prisma.leadActivity.count({ where: { type: "STATUS_CHANGED" } })).toBe(1);
  });

  it("lets exactly one of two concurrent changes win", async () => {
    const id = await createLead();

    const responses = await Promise.all([
      changeStatus(id, { status: "CONTACTED", version: 1 }),
      changeStatus(id, { status: "LOST", version: 1 }),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead.version).toBe(2);
    expect(await prisma.leadActivity.count({ where: { type: "STATUS_CHANGED" } })).toBe(1);
  });

  it("returns 404 for a lead that does not exist", async () => {
    const res = await changeStatus("0199a3b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b", {
      status: "CONTACTED",
      version: 1,
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid body", async () => {
    const id = await createLead();

    const res = await changeStatus(id, { status: "WON" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((issue: { path: string }) => issue.path)).toEqual([
      "status",
      "version",
    ]);
  });
});

describe("GET /leads/:id nextStatuses", () => {
  it("lists the moves the status dropdown should offer", async () => {
    const id = await createLead();

    const res = await request(app).get(`/leads/${id}`);

    expect(res.body.data.nextStatuses).toEqual(["CONTACTED", "LOST"]);
  });
});
