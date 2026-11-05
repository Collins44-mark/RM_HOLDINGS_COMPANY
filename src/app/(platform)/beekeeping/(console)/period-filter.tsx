"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const fieldClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function BeePeriodFilter({ period, from, to }: { period: string; from: string; to: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState(period);
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  useEffect(() => {
    setChoice(period);
    setFromDate(from);
    setToDate(to);
  }, [period, from, to]);

  function go(nextPeriod: string, nextFrom = "", nextTo = "") {
    const params = new URLSearchParams();
    params.set("period", nextPeriod);
    if (nextPeriod === "custom") {
      params.set("from", nextFrom);
      params.set("to", nextTo);
    }
    router.replace(`/beekeeping?${params.toString()}`);
  }

  function onPeriod(value: string) {
    setChoice(value);
    if (value !== "custom") go(value);
  }

  function onDate(which: "from" | "to", value: string) {
    const nextFrom = which === "from" ? value : fromDate;
    const nextTo = which === "to" ? value : toDate;
    if (which === "from") setFromDate(value);
    else setToDate(value);
    if (nextFrom && nextTo && nextFrom <= nextTo) go("custom", nextFrom, nextTo);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={choice} onChange={(event) => onPeriod(event.target.value)} className={fieldClass} aria-label="Period">
        <option value="month">This Month</option>
        <option value="week">This Week</option>
        <option value="year">This Year</option>
        <option value="custom">Custom range</option>
      </select>
      {choice === "custom" && (
        <>
          <input type="date" value={fromDate} onChange={(event) => onDate("from", event.target.value)} className={fieldClass} aria-label="From" />
          <input type="date" value={toDate} onChange={(event) => onDate("to", event.target.value)} className={fieldClass} aria-label="To" />
        </>
      )}
    </div>
  );
}
