import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { LEAD_STATUSES, type LeadSort, type LeadStatus } from "../api/leads";
import { LeadTable } from "../components/LeadTable";
import { Pagination } from "../components/Pagination";
import { useLeads } from "../hooks/leads";
import { STATUS_LABELS } from "../lib/format";

const PAGE_SIZE = 15;
const SEARCH_DELAY_MS = 300;

const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: "-createdAt", label: "Newest first" },
  { value: "createdAt", label: "Oldest first" },
  { value: "-updatedAt", label: "Recently updated" },
  { value: "fullName", label: "Name A–Z" },
];

const CONTROL =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// URL values are plain text anyone can edit: anything unexpected falls back to the default.
function parseStatus(value: string | null): LeadStatus | undefined {
  return LEAD_STATUSES.find((status) => status === value);
}

function parseSort(value: string | null): LeadSort {
  return SORT_OPTIONS.find((option) => option.value === value)?.value ?? "-createdAt";
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function LeadListPage() {
  // Filters live in the URL (?status=NEW&page=2): a filtered view can be shared and Back works.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const sort = parseSort(searchParams.get("sort"));
  const page = parsePage(searchParams.get("page"));
  const search = searchParams.get("search") ?? "";

  // Sets or clears URL params. Any change other than paging starts again from page 1.
  function updateParams(changes: Record<string, string | undefined>, options = { replace: false }) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!("page" in changes)) next.delete("page");
      return next;
    }, options);
  }

  // The box shows every keystroke; the URL (and so the request) follows once typing pauses.
  const [searchInput, setSearchInput] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => updateParams({ search: value || undefined }, { replace: true }),
      SEARCH_DELAY_MS,
    );
  }

  // When the URL changes from outside (Back/Forward), show its search text in the box.
  const [urlSearch, setUrlSearch] = useState(search);
  if (search !== urlSearch) {
    setUrlSearch(search);
    setSearchInput(search);
  }

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useLeads({
    page,
    limit: PAGE_SIZE,
    status,
    search: search || undefined,
    sort,
  });
  const hasFilters = Boolean(status || search);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <title>Leads · Lead Intake</title>
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
        <p className="text-sm text-slate-500">Captured from Meta Lead Ads</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search name, email or phone"
          aria-label="Search leads"
          className={`${CONTROL} w-72`}
        />
        <select
          value={status ?? ""}
          onChange={(event) => updateParams({ status: event.target.value || undefined })}
          aria-label="Filter by status"
          className={CONTROL}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) =>
            updateParams({ sort: event.target.value === "-createdAt" ? undefined : event.target.value })
          }
          aria-label="Sort leads"
          className={CONTROL}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <Message>Loading leads…</Message>
      ) : !data ? (
        <Message tone="error">
          {error?.message ?? "Something went wrong."}{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </Message>
      ) : data.data.length === 0 ? (
        <Message>
          {data.meta.total > 0 ? (
            <>
              There are no leads on this page.{" "}
              <button type="button" onClick={() => updateParams({ page: undefined })} className="font-medium underline">
                Go to the first page
              </button>
            </>
          ) : hasFilters ? (
            <>
              No leads match these filters.{" "}
              <button
                type="button"
                onClick={() => updateParams({ status: undefined, search: undefined })}
                className="font-medium underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            "No leads yet. They appear here as soon as Meta sends one (locally: npm run webhook:send)."
          )}
        </Message>
      ) : (
        <>
          {isError && <Message tone="error">Couldn't refresh the list: {error.message}</Message>}
          {/* Dimmed while the next page loads; the previous page stays readable meanwhile. */}
          <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <LeadTable leads={data.data} />
          </div>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={data.meta.total}
            onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
          />
        </>
      )}
    </main>
  );
}

function Message({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  const colors =
    tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600";
  return <div className={`rounded-lg border px-4 py-6 text-center text-sm ${colors}`}>{children}</div>;
}
