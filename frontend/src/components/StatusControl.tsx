import { type FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import type { LeadDetail, LeadStatus } from "../api/leads";
import { useUpdateLeadStatus } from "../hooks/leads";
import { STATUS_LABELS } from "../lib/format";

const CONTROL =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// Moves the lead to one of the statuses the API says it can reach next (nextStatuses).
export function StatusControl({ lead }: { lead: LeadDetail }) {
  const [nextStatus, setNextStatus] = useState<LeadStatus | "">("");
  const [note, setNote] = useState("");
  const mutation = useUpdateLeadStatus(lead.id);

  // After a save or a reload (409) the allowed moves change: drop a choice that no longer applies.
  if (nextStatus && !lead.nextStatuses.includes(nextStatus)) setNextStatus("");

  if (lead.nextStatuses.length === 0) {
    return <p className="text-sm text-slate-600">Converted is final: this lead has been handed off to booking.</p>;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nextStatus) return;
    mutation.mutate(
      { status: nextStatus, note: note.trim() || undefined, version: lead.version },
      {
        onSuccess: () => {
          setNextStatus("");
          setNote("");
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={nextStatus}
          onChange={(event) => {
            setNextStatus(event.target.value as LeadStatus | "");
            mutation.reset();
          }}
          aria-label="New status"
          className={CONTROL}
        >
          <option value="">Move to…</option>
          {lead.nextStatuses.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Note (optional), e.g. reason for Lost"
          aria-label="Note"
          className={`${CONTROL} min-w-64 flex-1`}
        />
        <button
          type="submit"
          disabled={!nextStatus || mutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Update status"}
        </button>
      </div>
      {mutation.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(mutation.error)}
        </p>
      )}
    </form>
  );
}

function errorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === "CONFLICT") {
    return "Someone else changed this lead a moment ago. The latest version is now shown: review it and try again.";
  }
  return error.message;
}
