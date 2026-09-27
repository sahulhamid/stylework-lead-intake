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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">
                <Link to={`/leads/${lead.id}`} className="hover:text-blue-700 hover:underline">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
