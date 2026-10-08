"use client";

import { SCHOOL_PAGE_SIZE, SCHOOL_PAGE_SIZES, schoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

export function replaceSchoolPageParam(page: number, pageSize?: number) {
  const url = new URL(window.location.href);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  if (pageSize && pageSize !== SCHOOL_PAGE_SIZE) url.searchParams.set("pageSize", String(pageSize));
  else if (pageSize === SCHOOL_PAGE_SIZE) url.searchParams.delete("pageSize");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function pageWindow(page: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  return [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
}

export function SchoolPagination({
  page,
  total,
  pageSize = SCHOOL_PAGE_SIZE,
  onPage,
  onPageSize,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPage: (page: number) => void;
  onPageSize?: (pageSize: number) => void;
}) {
  if (total <= 0) return null;
  const meta = schoolPageMeta(page, total, pageSize);
  const numbers = pageWindow(meta.page, meta.totalPages);

  return (
    <div className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        Showing {meta.from}–{meta.to} of {meta.total}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {onPageSize ? (
          <div className="mr-2 flex flex-wrap gap-1">
            {SCHOOL_PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onPageSize(size)}
                className={cn(
                  "h-8 min-w-8 rounded-full px-2.5 text-[12.5px] font-semibold transition duration-200",
                  size === meta.pageSize
                    ? "bg-navy text-white shadow-[0_4px_10px_rgba(11,34,68,0.16)]"
                    : "text-slate-500 hover:text-navy",
                )}
              >
                {size}
              </button>
            ))}
          </div>
        ) : null}
        {meta.totalPages > 1 ? (
          <>
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => onPage(meta.page - 1)}
              className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-slate-500 transition duration-200 hover:text-navy disabled:opacity-30"
            >
              Previous
            </button>
            {numbers.map((value, index) => {
              const previous = numbers[index - 1];
              return (
                <span key={value} className="inline-flex items-center">
                  {previous && value - previous > 1 ? <span className="px-1 text-[12.5px] text-slate-400">…</span> : null}
                  <button
                    type="button"
                    onClick={() => onPage(value)}
                    className={`h-8 min-w-8 rounded-full px-2.5 text-[12.5px] font-semibold transition duration-200 ${
                      value === meta.page
                        ? "bg-navy text-white shadow-[0_4px_10px_rgba(11,34,68,0.16)]"
                        : "text-slate-500 hover:text-navy"
                    }`}
                  >
                    {value}
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPage(meta.page + 1)}
              className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-slate-500 transition duration-200 hover:text-navy disabled:opacity-30"
            >
              Next
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
