import type { LeadgenValue } from "./webhook.schemas";

type FieldData = NonNullable<LeadgenValue["field_data"]>;

// A lead's contact details and extra form answers, normalized from Meta's field_data.
export type LeadDetails = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  customFields: Record<string, string>;
};

// Where lead details come from. Real Meta webhooks carry only IDs; production would call
// the Graph API (GET /{leadgen_id}). An interface keeps that swap out of the ingestion logic.
export interface LeadDataProvider {
  getLeadDetails(lead: LeadgenValue): Promise<LeadDetails>;
}

const CONTACT_FIELDS = new Set([
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "city",
]);

// Maps Meta's field_data ([{ name, values }]) to our columns. The Graph API returns the
// same shape, so a real provider can reuse this.
export function mapFieldData(fieldData: FieldData): LeadDetails {
  const answers = new Map(
    fieldData.map((field) => [field.name, field.values.join(", ").trim() || null] as const),
  );
  const fullName =
    answers.get("full_name") ??
    ([answers.get("first_name"), answers.get("last_name")].filter(Boolean).join(" ") || null);

  const customFields: Record<string, string> = {};
  for (const [name, value] of answers) {
    if (!CONTACT_FIELDS.has(name) && value !== null) customFields[name] = value;
  }

  return {
    fullName,
    email: answers.get("email")?.toLowerCase() ?? null,
    phone: answers.get("phone_number") ?? null,
    city: answers.get("city") ?? null,
    customFields,
  };
}

// Stand-in for the Graph API: reads field_data sent inline with the webhook (local testing).
export class InlineLeadDataProvider implements LeadDataProvider {
  async getLeadDetails(lead: LeadgenValue): Promise<LeadDetails> {
    return mapFieldData(lead.field_data ?? []);
  }
}
