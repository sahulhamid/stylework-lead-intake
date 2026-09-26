// Sends a Meta-style lead webhook, signed with META_APP_SECRET, like Meta would.
//   npm run webhook:send                                     one new lead
//   npm run webhook:send -- --count 5                        five new leads in one batch
//   npm run webhook:send -- --id demo-1                      a fixed lead (send twice: "unchanged")
//   npm run webhook:send -- --id demo-1 --phone +919812345678   same lead, new phone: "updated"
//   npm run webhook:send -- --url https://<api-host>/webhook/meta-lead
import { createHmac } from "node:crypto";
import { parseArgs } from "node:util";

const NAMES = ["Asha Rao", "Ravi Kumar", "Priya Sharma", "Arjun Mehta", "Neha Iyer", "Karthik Reddy"];
const CITIES = ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi"];
const TEAM_SIZES = ["1-5", "6-20", "21-50", "50+"];

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    count: { type: "string", default: "1" },
    phone: { type: "string" },
    url: {
      type: "string",
      default: `http://localhost:${process.env["PORT"] ?? 4000}/webhook/meta-lead`,
    },
  },
});

// A number derived from the id, so the same id always produces the same lead details
// and re-sending it is a true duplicate.
function seedOf(id: string): number {
  return [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function leadValue(id: string) {
  const seed = seedOf(id);
  const pick = (list: string[], salt: number) => list[(seed + salt) % list.length] ?? "";
  const name = pick(NAMES, 0);
  const startOfToday = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
  return {
    leadgen_id: id,
    page_id: "stylework-page",
    form_id: "coworking-enquiry",
    ad_id: "ad-coworking-q3",
    campaign_id: "campaign-flexi-desks",
    created_time: startOfToday - (seed % 86_400), // some time yesterday, fixed per id
    field_data: [
      { name: "full_name", values: [name] },
      { name: "email", values: [`${name.split(" ")[0]?.toLowerCase()}.${seed % 1000}@example.com`] },
      { name: "phone_number", values: [values.phone ?? `+9198${String(seed % 1e8).padStart(8, "0")}`] },
      { name: "city", values: [pick(CITIES, 1)] },
      { name: "team_size", values: [pick(TEAM_SIZES, 2)] },
    ],
  };
}

async function main(): Promise<void> {
  const secret = process.env["META_APP_SECRET"];
  if (!secret) {
    console.error("META_APP_SECRET is not set: add it to backend/.env or the environment.");
    process.exit(1);
  }

  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    console.error("--count must be a whole number from 1 to 50.");
    process.exit(1);
  }

  const now = Date.now();
  const ids = values.id ? [values.id] : Array.from({ length: count }, (_, i) => `lead-${now}-${i + 1}`);
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "stylework-page",
        time: Math.floor(now / 1000),
        changes: ids.map((id) => ({ field: "leadgen", value: leadValue(id) })),
      },
    ],
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const res = await fetch(values.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
    body,
  });
  console.log(`POST ${values.url} → ${res.status} ${await res.text()}`);
  console.log(`leadgen_id: ${ids.join(", ")}`);
  if (!res.ok) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
