import type { LeadStatus } from "../api/leads";
import { STATUS_LABELS } from "../lib/format";

// Full class strings (never built from pieces) so Tailwind can find them in the source.
const STYLES: Record<LeadStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-600/20",
  CONTACTED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  QUALIFIED: "bg-violet-50 text-violet-700 ring-violet-600/20",
  CONVERTED: "bg-green-50 text-green-700 ring-green-600/20",
  LOST: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
