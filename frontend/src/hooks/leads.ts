import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  getLead,
  getLeads,
  updateLeadStatus,
  type LeadListParams,
  type StatusUpdate,
} from "../api/leads";

// Every cache key for lead data, built in one place. Keys are hierarchical, so
// invalidating a prefix (all, lists) marks everything under it as stale.
export const leadKeys = {
  all: ["leads"] as const,
  lists: ["leads", "list"] as const,
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

// One lead with its timeline and the statuses it can move to.
export function useLead(id: string) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => getLead(id, signal),
  });
}

// Changes a lead's status. The PATCH response is the updated lead, so it goes straight
// into the detail cache; list pages are marked stale and refetch with the new badge.
export function useUpdateLeadStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: StatusUpdate) => updateLeadStatus(id, update),
    onSuccess: (lead) => {
      queryClient.setQueryData(leadKeys.detail(id), lead);
      void queryClient.invalidateQueries({ queryKey: leadKeys.lists });
    },
    onError: (error) => {
      // 409: someone else changed the lead. Reload it so the page shows the latest version.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: leadKeys.detail(id) });
      }
    },
  });
}
