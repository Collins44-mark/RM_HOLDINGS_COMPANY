"use client";

import { SCHOOL_PAGE_SIZE, SCHOOL_PAGE_SIZES, schoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

export function replaceSchoolPageParam(
  page: number,
  pageSize?: number,
  extra?: { status?: string; q?: string; levelId?: string; classId?: string; streamId?: string },
) {
  const url = new URL(window.location.href);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  if (pageSize && pageSize !== SCHOOL_PAGE_SIZE) url.searchParams.set("pageSize", String(pageSize));
  else if (pageSize === SCHOOL_PAGE_SIZE) url.searchParams.delete("pageSize");
  if (extra) {
    if ("status" in extra) {
      if (extra.status && extra.status !== "all") url.searchParams.set("status", extra.status);
      else url.searchParams.delete("status");
    }
    if ("q" in extra) {
      if (extra.q) url.searchParams.set("q", extra.q);
      else url.searchParams.delete("q");
    }
    if ("levelId" in extra) {
      if (extra.levelId) url.searchParams.set("levelId", extra.levelId);
      else url.searchParams.delete("levelId");
    }
    if ("classId" in extra) {
      if (extra.classId) url.searchParams.set("classId", extra.classId);
      else url.searchParams.delete("classId");
    }
    if ("streamId" in extra) {
      if (extra.streamId) url.searchParams.set("streamId", extra.streamId);
      else url.searchParams.delete("streamId");
    }
  }
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
  pendingPageSize = null,
  onPage,
  onPageSize,
}: {
  page: number;
  total: number;
  pageSize?: number;
  pendingPageSize?: number | null;
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
          <div className="mr-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11.5px] font-medium tracking-[-0.01em] text-slate-400">Rows per page</span>
            {SCHOOL_PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onPageSize(size)}
                aria-busy={pendingPageSize === size}
                className={cn(
                  "h-8 min-w-8 rounded-full px-2.5 text-[12.5px] font-semibold transition duration-200",
                  size === meta.pageSize
                    ? "bg-navy text-white shadow-[0_4px_10px_rgba(11,34,68,0.16)]"
                    : "text-slate-500 hover:text-navy",
                  pendingPageSize === size && size !== meta.pageSize ? "ring-1 ring-navy/20 text-navy" : null,
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
