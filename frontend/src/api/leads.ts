import { apiFetch } from "./client";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type ActivityType = "LEAD_CREATED" | "LEAD_UPDATED" | "STATUS_CHANGED";

// Dates arrive as ISO strings: JSON has no date type.
export type Lead = {
  id: string;
  metaLeadId: string;
  formId: string | null;
  adId: string | null;
  campaignId: string | null;
  pageId: string | null;
  metaCreatedAt: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  customFields: Record<string, string>;
  status: LeadStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  type: ActivityType;
  actor: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  note: string | null;
  createdAt: string;
};

export type LeadDetail = Lead & {
  rawPayload: unknown;
  activities: Activity[];
  nextStatuses: LeadStatus[];
};

export type LeadSort = "createdAt" | "-createdAt" | "updatedAt" | "-updatedAt" | "fullName" | "-fullName";

export type LeadListParams = {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  search?: string;
  sort?: LeadSort;
};

export type LeadListResponse = {
  data: Lead[];
  meta: { page: number; limit: number; total: number };
};

export type StatusUpdate = { status: LeadStatus; note?: string; version: number };

export function getLeads(params: LeadListParams, signal?: AbortSignal): Promise<LeadListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const queryString = query.toString();
  return apiFetch<LeadListResponse>(`/leads${queryString ? `?${queryString}` : ""}`, { signal });
}

export async function getLead(id: string, signal?: AbortSignal): Promise<LeadDetail> {
  const res = await apiFetch<{ data: LeadDetail }>(`/leads/${encodeURIComponent(id)}`, { signal });
  return res.data;
}

export async function updateLeadStatus(id: string, update: StatusUpdate): Promise<LeadDetail> {
  const res = await apiFetch<{ data: LeadDetail }>(`/leads/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return res.data;
}
