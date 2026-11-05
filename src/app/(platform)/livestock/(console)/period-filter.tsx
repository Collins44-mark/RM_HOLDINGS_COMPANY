"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS = [
  { value: "month", label: "This Month" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom range" },
];

export function LivestockPeriodFilter({ period, from, to }: { period: string; from: string; to: string }) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  function go(nextPeriod: string, nextFrom = fromDate, nextTo = toDate) {
    const params = new URLSearchParams();
    params.set("period", nextPeriod);
    if (nextPeriod === "custom") {
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
    }
    router.push(`/livestock?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex items-center">
        <span className="sr-only">Period</span>
        <select
          value={period}
          onChange={(event) => go(event.target.value, fromDate, toDate)}
          className="h-10 appearance-none rounded-[11px] border border-black/8 bg-white py-2 pl-3 pr-9 text-[13.5px] font-medium text-navy outline-none focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </label>
      {period === "custom" ? (
        <>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              if (event.target.value && toDate && event.target.value <= toDate) go("custom", event.target.value, toDate);
            }}
            className="h-10 rounded-xl border border-black/8 bg-white px-3 text-sm text-navy"
            aria-label="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              if (fromDate && event.target.value && fromDate <= event.target.value) go("custom", fromDate, event.target.value);
            }}
            className="h-10 rounded-xl border border-black/8 bg-white px-3 text-sm text-navy"
            aria-label="To date"
          />
        </>
      ) : null}
    </div>
  );
}
