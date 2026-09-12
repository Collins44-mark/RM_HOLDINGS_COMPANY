"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PERIOD_OPTIONS, type RevenuePeriod } from "@/lib/data/period";

export function PeriodFilter({
  period,
  label,
}: {
  period: RevenuePeriod;
  label: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex items-center">
        <span className="sr-only">Revenue period</span>
        <select
          value={period}
          onChange={(event) => {
            const value = event.target.value;
            update({
              period: value,
              from: value === "custom" ? searchParams.get("from") ?? "" : undefined,
              to: value === "custom" ? searchParams.get("to") ?? "" : undefined,
            });
          }}
          className="h-10 appearance-none rounded-[11px] border border-black/8 bg-white py-2 pl-3 pr-9 text-[13.5px] font-medium text-navy outline-none focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === period ? label : option.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </label>
      {period === "custom" ? (
        <>
          <input
            type="date"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(event) => update({ period: "custom", from: event.target.value, to: searchParams.get("to") ?? undefined })}
            className="h-10 rounded-xl border border-black/8 bg-white px-3 text-sm text-navy"
            aria-label="From date"
          />
          <input
            type="date"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(event) => update({ period: "custom", from: searchParams.get("from") ?? undefined, to: event.target.value })}
            className="h-10 rounded-xl border border-black/8 bg-white px-3 text-sm text-navy"
            aria-label="To date"
          />
        </>
      ) : null}
    </div>
  );
}
