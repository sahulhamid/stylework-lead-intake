import type { Activity, LeadStatus } from "../api/leads";
import { formatDateTime, STATUS_LABELS } from "../lib/format";

// Dot colours follow the status badge: blue new, amber contacted, violet qualified,
// green converted, grey lost. Field updates from Meta get their own sky blue.
const STATUS_DOTS: Record<LeadStatus, string> = {
  NEW: "bg-blue-500 ring-blue-100",
  CONTACTED: "bg-amber-500 ring-amber-100",
  QUALIFIED: "bg-violet-500 ring-violet-100",
  CONVERTED: "bg-green-500 ring-green-100",
  LOST: "bg-slate-400 ring-slate-100",
};
const UPDATE_DOT = "bg-sky-500 ring-sky-100";

const FIELD_LABELS: Record<string, string> = {
  fullName: "Name",
  email: "Email",
  phone: "Phone",
  city: "City",
  customFields: "Form answers",
  formId: "Form",
  adId: "Ad",
  campaignId: "Campaign",
  pageId: "Page",
  metaCreatedAt: "Submitted at",
};

const ACTOR_LABELS: Record<string, string> = {
  "system:meta-webhook": "Meta webhook",
  dashboard: "Dashboard",
};

// The lead's audit trail as a tracking-style timeline, newest (the current state) on top.
export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <ol>
      {activities.map((activity, index) => {
        const { dot, icon } = marker(activity);
        const isLatest = index === 0;
        const isLast = index === activities.length - 1;
        return (
          <li key={activity.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The line joining this step to the one below it. */}
            {!isLast && (
              <span aria-hidden="true" className="absolute left-3 top-7 bottom-0 w-0.5 -translate-x-1/2 bg-slate-300" />
            )}
            <span
              aria-hidden="true"
              className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dot} ${isLatest ? "ring-4" : ""}`}
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className={isLatest ? "font-semibold text-slate-900" : "font-medium text-slate-700"}>
                {describe(activity)}
              </p>
              {activity.changes && <ChangeList changes={activity.changes} />}
              {activity.note && (
                <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-slate-700">“{activity.note}”</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {ACTOR_LABELS[activity.actor] ?? activity.actor} ·{" "}
                <time dateTime={activity.createdAt}>{formatDateTime(activity.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// The dot for a step: status changes take the colour of the status they moved to.
function marker(activity: Activity): { dot: string; icon: string } {
  if (activity.type === "LEAD_UPDATED") return { dot: UPDATE_DOT, icon: "✎" };
  if (activity.type === "LEAD_CREATED") return { dot: STATUS_DOTS.NEW, icon: "+" };
  const to = activity.toStatus ?? "NEW";
  const icon = to === "CONVERTED" ? "✓" : to === "LOST" ? "✕" : "→";
  return { dot: STATUS_DOTS[to], icon };
}

function describe(activity: Activity): string {
  if (activity.type === "STATUS_CHANGED" && activity.fromStatus && activity.toStatus) {
    return `${STATUS_LABELS[activity.fromStatus]} → ${STATUS_LABELS[activity.toStatus]}`;
  }
  return activity.type === "LEAD_CREATED" ? "Lead received from Meta" : "Details updated by Meta";
}

// LEAD_UPDATED diff: one line per changed field, old value struck through.
function ChangeList({ changes }: { changes: NonNullable<Activity["changes"]> }) {
  return (
    <ul className="mt-1 space-y-0.5 text-slate-600">
      {Object.entries(changes).map(([field, change]) => (
        <li key={field}>
          <span className="font-medium">{FIELD_LABELS[field] ?? field}:</span>{" "}
          <del className="text-slate-400">{display(change.old)}</del> → {display(change.new)}
        </li>
      ))}
    </ul>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  return typeof value === "string" ? value : JSON.stringify(value);
}
