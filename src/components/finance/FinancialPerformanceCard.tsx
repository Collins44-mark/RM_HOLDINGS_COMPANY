"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { BusinessUnitFinanceTable } from "@/components/finance/BusinessUnitFinanceTable";
import type { UnitFinanceRow } from "@/lib/data/finance";

type FilterId = "all" | "healthy" | "watch";

export function FinancialPerformanceCard({
  rows,
  totals,
}: {
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !needle || row.name.toLowerCase().includes(needle);
      const matchesFilter =
        filter === "all" ||
        (filter === "healthy" && row.margin >= 40) ||
        (filter === "watch" && row.margin < 30);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, rows]);

  return (
    <section className="overflow-hidden rounded-card border border-[color:var(--color-line)] bg-white shadow-card">
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">
          Financial Performance by Business Unit
        </h2>
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-[240px] sm:flex-none">
            <span className="sr-only">Search business units</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search business units..."
              className="h-10 w-full rounded-[11px] border border-black/8 bg-[#f7f8fb] pl-9 pr-3 text-[13px] text-navy outline-none transition duration-200 focus:border-[#c9d7f5] focus:bg-white focus:ring-4 focus:ring-[#3a6fd4]/10"
            />
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] border border-black/8 bg-white text-slate-600 transition duration-200 hover:bg-slate-50"
              aria-label="Filter business units"
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.85} />
            </button>
            {filterOpen ? (
              <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-black/6 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.12)]">
                {(
                  [
                    { id: "all", label: "All units" },
                    { id: "healthy", label: "Margin 40%+" },
                    { id: "watch", label: "Margin below 30%" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setFilter(option.id);
                      setFilterOpen(false);
                    }}
                    className="block w-full px-3 py-2.5 text-left text-[13px] text-navy hover:bg-slate-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-500">No business units match this search.</p>
      ) : (
        <BusinessUnitFinanceTable
          rows={visibleRows}
          totals={filter === "all" && !query ? totals : {
            revenue: visibleRows.reduce((sum, row) => sum + row.revenue, 0),
            expenses: visibleRows.reduce((sum, row) => sum + row.expenses, 0),
            operatingPosition: visibleRows.reduce((sum, row) => sum + row.operatingPosition, 0),
            margin: visibleRows.reduce((sum, row) => sum + row.revenue, 0)
              ? (visibleRows.reduce((sum, row) => sum + row.operatingPosition, 0) /
                  visibleRows.reduce((sum, row) => sum + row.revenue, 0)) *
                100
              : 0,
          }}
        />
      )}
    </section>
  );
}
