type PaginationProps = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
};

const BUTTON =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <p>
        Page {page} of {lastPage} · {total} {total === 1 ? "lead" : "leads"}
      </p>
      <div className="flex gap-2">
        <button type="button" className={BUTTON} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <button type="button" className={BUTTON} disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
