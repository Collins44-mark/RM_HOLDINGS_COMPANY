"use client";

import { cn } from "@/lib/cn";
import { PAGE_SIZES, pageMeta } from "@/lib/pagination";
import { useT } from "@/components/i18n/LocaleProvider";

function pageWindow(page: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  return [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
}

export function PaginationBar({
  page,
  total,
  pageSize,
  sizes = PAGE_SIZES,
  pendingPageSize = null,
  onPage,
  onPageSize,
}: {
  page: number;
  total: number;
  pageSize: number;
  sizes?: readonly number[];
  pendingPageSize?: number | null;
  onPage: (page: number) => void;
  onPageSize?: (pageSize: number) => void;
}) {
  const t = useT();
  if (total <= 0) return null;
  const meta = pageMeta(page, total, pageSize);
  const numbers = pageWindow(meta.page, meta.totalPages);

  return (
    <div className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        {t("pager.showing", { from: meta.from, to: meta.to, total: meta.total })}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {onPageSize ? (
          <div className="mr-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11.5px] font-medium tracking-[-0.01em] text-slate-400">{t("pager.rows")}</span>
            {sizes.map((size) => (
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
              {t("pager.previous")}
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
              {t("pager.next")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
