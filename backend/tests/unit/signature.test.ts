import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "../../src/modules/webhook/signature";

const SECRET = "test-app-secret-1234";
const body = Buffer.from('{"object":"page","entry":[]}');

// Signs the way Meta does: HMAC-SHA256 of the raw bytes, hex, "sha256=" prefix.
function sign(payload: Buffer, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("verifySignature", () => {
  it("accepts a body signed with the app secret", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifySignature(body, sign(body, "some-other-secret"), SECRET)).toBe(false);
  });

  it("rejects a body changed after signing", () => {
    const tampered = Buffer.from('{"object":"page","entry":[1]}');
    expect(verifySignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects the same JSON with different bytes (why we sign the raw body)", () => {
    const reformatted = Buffer.from('{ "object": "page", "entry": [] }');
    expect(verifySignature(reformatted, sign(body), SECRET)).toBe(false);
  });

  it("rejects a missing header or missing raw body", () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(undefined, sign(body), SECRET)).toBe(false);
  });

  it.each([
    ["wrong algorithm prefix", sign(body).replace("sha256=", "sha1=")],
    ["digest too short", sign(body).slice(0, -2)],
    ["digest with trailing junk", `${sign(body)}zz`],
    ["non-hex digest", `sha256=${"g".repeat(64)}`],
  ])("rejects a malformed header: %s", (_label, header) => {
    expect(verifySignature(body, header, SECRET)).toBe(false);
  });
});
