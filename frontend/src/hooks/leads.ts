import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getLeads, type LeadListParams } from "../api/leads";

// Every cache key for lead data, built in one place. Keys are hierarchical, so
// invalidating leadKeys.all refreshes every list and detail after a change.
export const leadKeys = {
  all: ["leads"] as const,
  list: (params: LeadListParams) => ["leads", "list", params] as const,
  detail: (id: string) => ["leads", "detail", id] as const,
};

// One page of leads. Changing any param changes the key, which fetches that page;
// the previous page stays on screen until the new one arrives.
export function useLeads(params: LeadListParams) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: ({ signal }) => getLeads(params, signal),
    placeholderData: keepPreviousData,
  });
}
