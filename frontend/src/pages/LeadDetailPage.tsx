import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ApiError } from "../api/client";
import type { LeadDetail } from "../api/leads";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { StatusBadge } from "../components/StatusBadge";
import { StatusControl } from "../components/StatusControl";
import { useLead } from "../hooks/leads";
import { formatDateTime } from "../lib/format";

export function LeadDetailPage() {
  const { id = "" } = useParams();
  const { data: lead, isPending, error, refetch } = useLead(id);
  const navigate = useNavigate();
  const location = useLocation();

  // Back to the list the user came from (keeping its filters), or to the list if they opened this link directly.
  const goBack = () => (location.key === "default" ? navigate("/") : navigate(-1));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <title>{`${lead?.fullName ?? "Lead"} · Lead Intake`}</title>
      <button type="button" onClick={goBack} className="text-sm text-blue-700 hover:underline">
        ← Back to leads
      </button>

      {lead ? (
        <LeadDetails lead={lead} />
      ) : isPending ? (
        <Notice>Loading lead…</Notice>
      ) : error instanceof ApiError && (error.status === 404 || error.status === 400) ? (
        <Notice>This lead doesn't exist. It may have been mistyped in the link.</Notice>
      ) : (
        <Notice tone="error">
          {error?.message ?? "Something went wrong."}{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </Notice>
      )}
    </main>
  );
}

function LeadDetails({ lead }: { lead: LeadDetail }) {
  const answers = Object.entries(lead.customFields);

  return (
    <>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{lead.fullName ?? "Unnamed lead"}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <p className="text-sm text-slate-500">
          Received {formatDateTime(lead.createdAt)} · Meta lead ID {lead.metaLeadId}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Contact">
          <Fields>
            <Field label="Email">{lead.email && <a href={`mailto:${lead.email}`} className="text-blue-700 hover:underline">{lead.email}</a>}</Field>
            <Field label="Phone">{lead.phone && <a href={`tel:${lead.phone}`} className="text-blue-700 hover:underline">{lead.phone}</a>}</Field>
            <Field label="City">{lead.city}</Field>
          </Fields>
        </Section>
        <Section title="Source">
          <Fields>
            <Field label="Form">{lead.formId}</Field>
            <Field label="Campaign">{lead.campaignId}</Field>
            <Field label="Ad">{lead.adId}</Field>
            <Field label="Submitted">{lead.metaCreatedAt && formatDateTime(lead.metaCreatedAt)}</Field>
          </Fields>
        </Section>
      </div>

      {answers.length > 0 && (
        <Section title="Form answers">
          <Fields>
            {answers.map(([question, answer]) => (
              <Field key={question} label={question.replaceAll("_", " ")}>
                {answer}
              </Field>
            ))}
          </Fields>
        </Section>
      )}

      <Section title="Update status">
        <StatusControl lead={lead} />
      </Section>

      <Section title="Activity">
        <ActivityTimeline activities={lead.activities} />
      </Section>

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Raw webhook payload</summary>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(lead.rawPayload, null, 2)}
        </pre>
      </details>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="space-y-2 text-sm">{children}</dl>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="capitalize text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words text-slate-900">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  const colors =
    tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600";
  return <div className={`rounded-lg border px-4 py-6 text-center text-sm ${colors}`}>{children}</div>;
}
