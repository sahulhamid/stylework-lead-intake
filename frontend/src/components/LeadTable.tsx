import { Link } from "react-router";
import type { Lead } from "../api/leads";
import { formatDateTime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const HEADERS = ["Name", "Contact", "Status", "Source", "Received"];

export function LeadTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                {header}
              </th>
            ))}
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="group hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">
                <Link to={`/leads/${lead.id}`} className="text-slate-900 hover:text-blue-700 hover:underline">
                  {lead.fullName ?? "Unnamed lead"}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <div>{lead.email ?? "—"}</div>
                <div className="text-xs text-slate-500">{lead.phone}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                <div>{lead.formId ?? "—"}</div>
                <div className="text-xs text-slate-500">{lead.campaignId}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {formatDateTime(lead.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                {/* Shown on row hover, and on keyboard focus so it is never unreachable. */}
                <Link
                  to={`/leads/${lead.id}`}
                  aria-label={`View ${lead.fullName ?? "lead"}`}
                  title="View details"
                  className="inline-flex rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-blue-700 focus:opacity-100 group-hover:opacity-100"
                >
                  <EyeIcon />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Outline "eye" icon (Heroicons, MIT).
function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}
