import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";
// Exactly 64 hex characters: a SHA-256 digest. Checked up front because Buffer.from(hex)
// silently ignores trailing garbage, and timingSafeEqual throws on unequal lengths.
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

// Checks Meta's X-Hub-Signature-256 header: "sha256=" + hex HMAC-SHA256 of the raw
// request body, keyed with the app secret. Never throws; malformed input is invalid.
export function verifySignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader?.startsWith(PREFIX)) return false;

  const receivedHex = signatureHeader.slice(PREFIX.length);
  if (!HEX_DIGEST.test(receivedHex)) return false;

  const received = Buffer.from(receivedHex, "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}
