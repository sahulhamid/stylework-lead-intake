import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./helpers";

const DASHBOARD = "http://localhost:5173"; // the CORS_ORIGINS default

// The preflight a browser sends before a cross-origin PATCH with a JSON body.
function preflight(path: string, origin: string, method: string) {
  return request(app)
    .options(path)
    .set("Origin", origin)
    .set("Access-Control-Request-Method", method)
    .set("Access-Control-Request-Headers", "content-type");
}

describe("CORS", () => {
  it("lets the dashboard origin send a status update", async () => {
    const res = await preflight("/leads/some-id/status", DASHBOARD, "PATCH");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(DASHBOARD);
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
  });

  it("gives other origins no permission", async () => {
    const res = await preflight("/leads/some-id/status", "https://evil.example", "PATCH");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not open the webhook to browsers", async () => {
    const res = await preflight("/webhook/meta-lead", DASHBOARD, "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
