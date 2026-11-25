"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  showWhenEmpty = false,
  pageSizeEditable = false,
  onPage,
  onPageSize,
}: {
  page: number;
  total: number;
  pageSize: number;
  sizes?: readonly number[];
  pendingPageSize?: number | null;
  showWhenEmpty?: boolean;
  pageSizeEditable?: boolean;
  onPage: (page: number) => void;
  onPageSize?: (pageSize: number) => void;
}) {
  const t = useT();
  if (total <= 0 && !showWhenEmpty) return null;
  const meta = pageMeta(page, total, pageSize);
  const numbers = pageWindow(meta.page, meta.totalPages);

  return (
    <div className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        {t("pager.showing", { from: meta.from, to: meta.to, total: meta.total })}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {onPageSize && pageSizeEditable ? (
          <PageSizeField label={t("pager.rows")} value={meta.pageSize} sizes={sizes} onChange={onPageSize} />
        ) : null}
        {onPageSize && !pageSizeEditable ? (
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

function PageSizeField({
  label,
  value,
  sizes,
  onChange,
}: {
  label: string;
  value: number;
  sizes: readonly number[];
  onChange: (pageSize: number) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function apply(raw: string) {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 1 || next > 200) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onChange(next);
    setDraft(String(next));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative mr-2 flex items-center gap-1">
      <span className="mr-1 text-[11.5px] font-medium tracking-[-0.01em] text-slate-400">{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        list={listId}
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => apply(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply(draft);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        className="h-8 w-[4.75rem] rounded-full border border-white/75 bg-white/85 pl-3 pr-7 text-[12.5px] font-semibold text-navy shadow-[0_6px_14px_rgba(15,35,64,0.06)] outline-none"
      />
      <button
        type="button"
        aria-label={`${label} options`}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className="absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-navy"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <datalist id={listId}>
        {sizes.map((size) => <option key={size} value={size} />)}
      </datalist>
      {open ? (
        <ul className="absolute right-0 top-9 z-20 min-w-[4.75rem] overflow-hidden rounded-2xl border border-white/80 bg-white py-1 shadow-[0_12px_28px_rgba(15,35,64,0.12)]">
          {sizes.map((size) => (
            <li key={size}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(String(size))}
                className={cn(
                  "flex h-8 w-full items-center px-3 text-left text-[12.5px] font-semibold",
                  size === value ? "bg-navy text-white" : "text-navy hover:bg-[#f4f7fb]",
                )}
              >
                {size}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
