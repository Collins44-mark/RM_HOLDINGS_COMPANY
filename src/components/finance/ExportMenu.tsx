"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { UnitFinanceRow } from "@/lib/data/finance";

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ExportMenu({
  rows,
  totals,
}: {
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
}) {
  const [open, setOpen] = useState(false);

  function downloadCsv() {
    const header = [
      "Business Unit",
      "Revenue (TZS)",
      "Expenses (TZS)",
      "Operating Position (TZS)",
      "Margin (%)",
    ];
    const body = rows.map((row) => [
      row.name,
      row.revenue,
      row.expenses,
      row.operatingPosition,
      row.margin.toFixed(1),
    ]);
    const total = [
      "Total (All Business Units)",
      totals.revenue,
      totals.expenses,
      totals.operatingPosition,
      totals.margin.toFixed(1),
    ];
    const csv = [header, ...body, total]
      .map((line) => line.map(csvValue).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rm-holdings-consolidated-finance.csv";
    link.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  function copySummary() {
    const lines = [
      "RM Holdings Ltd — Consolidated Finance",
      ...rows.map(
        (row) =>
          `${row.name}: ${formatTzs(row.revenue)} revenue, ${formatTzs(row.expenses)} expenses, ${formatPercent(row.margin)} margin`,
      ),
      `Total: ${formatTzs(totals.revenue)} revenue, ${formatTzs(totals.expenses)} expenses, ${formatPercent(totals.margin)} margin`,
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
    setOpen(false);
  }

  return (
    <div
      className="relative"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-12 items-center gap-2 rounded-[12px] border border-black/8 bg-white px-4 text-[13.5px] font-medium text-navy outline-none transition duration-200 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-[#3a6fd4]/10"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Download className="h-4 w-4 text-slate-500" strokeWidth={1.85} />
        Export
        <ChevronDown className="h-4 w-4 text-slate-500" strokeWidth={1.85} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-black/6 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={downloadCsv}
            className="block w-full px-3 py-2.5 text-left text-[13.5px] text-navy hover:bg-slate-50"
          >
            Download CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={copySummary}
            className="block w-full px-3 py-2.5 text-left text-[13.5px] text-navy hover:bg-slate-50"
          >
            Copy summary
          </button>
        </div>
      ) : null}
    </div>
  );
}
