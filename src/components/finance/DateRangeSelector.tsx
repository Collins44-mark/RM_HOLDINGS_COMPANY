"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { PERIOD_OPTIONS, type RevenuePeriod } from "@/lib/data/period";

export function DateRangeSelector({
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
        <span className="sr-only">Finance period</span>
        <Calendar className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500" strokeWidth={1.85} />
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
          className="h-12 appearance-none rounded-[12px] border border-black/8 bg-white py-2 pl-10 pr-10 text-[13.5px] font-medium text-navy outline-none transition duration-200 focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === period ? label : option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" strokeWidth={1.85} />
      </label>
      {period === "custom" ? (
        <>
          <input
            type="date"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(event) =>
              update({
                period: "custom",
                from: event.target.value,
                to: searchParams.get("to") ?? undefined,
              })
            }
            className="h-12 rounded-[12px] border border-black/8 bg-white px-3 text-sm text-navy outline-none focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
            aria-label="From date"
          />
          <input
            type="date"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(event) =>
              update({
                period: "custom",
                from: searchParams.get("from") ?? undefined,
                to: event.target.value,
              })
            }
            className="h-12 rounded-[12px] border border-black/8 bg-white px-3 text-sm text-navy outline-none focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
            aria-label="To date"
          />
        </>
      ) : null}
    </div>
  );
}
