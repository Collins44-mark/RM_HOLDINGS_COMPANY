"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, HeartPulse, Home, Landmark, PawPrint, ShoppingBag, Wallet } from "lucide-react";
import { reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { PagedReportTable } from "@/components/ui/PagedReportTable";
import { buildLivestockReport } from "@/lib/livestock/reports";

const CARDS = [
  { id: "inventory", name: "Livestock", icon: PawPrint, reports: [{ id: "ls-inventory", label: "Livestock Inventory Report" }] },
  { id: "purchases", name: "Purchases", icon: ShoppingBag, reports: [{ id: "ls-purchases", label: "Livestock Purchase Report" }] },
  { id: "reproduction", name: "Reproduction", icon: HeartPulse, reports: [{ id: "ls-pregnancy", label: "Pregnancy Report" }, { id: "ls-births", label: "Birth Report" }] },
  { id: "movements", name: "Movements", icon: ArrowLeftRight, reports: [{ id: "ls-movements", label: "Livestock Movement Report" }] },
  { id: "sales", name: "Sales", icon: ShoppingBag, reports: [{ id: "ls-sales", label: "Livestock Sales Report" }] },
  { id: "houses", name: "Poultry Houses", icon: Home, reports: [{ id: "ls-houses", label: "Poultry Houses Report" }, { id: "ls-rent", label: "Rental Income Report" }] },
  { id: "expenses", name: "Expenses", icon: Wallet, reports: [{ id: "ls-expenses", label: "Livestock Expenses Report" }] },
  { id: "finance", name: "Finance", icon: Landmark, reports: [{ id: "ls-financial", label: "Livestock Financial Summary" }] },
] as const;

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom range" },
];

const fieldClass = "mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300";

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ReportsView({ initial, seed }: { initial: LivestockDirectory; seed: { from: string; to: string; label: string } }) {
  const [openId, setOpenId] = useState("");
  const [reportId, setReportId] = useState("ls-inventory");
  const [period, setPeriod] = useState<ReportPeriod>("this-month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [range, setRange] = useState(seed);
  const from = range.from;
  const to = range.to;
  const report = buildLivestockReport(reportId, initial, from, to);
  const pdf = `/api/livestock/reports/pdf?report=${encodeURIComponent(reportId)}&from=${from}&to=${to}&period=${encodeURIComponent(range.label)}`;
  const center = `/owner/reports?module=livestock&report=${encodeURIComponent(reportId)}&period=${period}${period === "custom" ? `&from=${from}&to=${to}` : ""}&view=1`;
  const rows: (typeof CARDS)[number][][] = [];
  for (let index = 0; index < CARDS.length; index += 4) rows.push(CARDS.slice(index, index + 4));

  function applyPeriod(next: ReportPeriod, nextFrom = fromDate, nextTo = toDate) {
    setPeriod(next);
    if (next === "custom") {
      if (nextFrom && nextTo && nextFrom <= nextTo) setRange({ from: nextFrom, to: nextTo, label: "Custom" });
      return;
    }
    const nextRange = reportPeriodRange(next, new Date());
    setRange({ from: iso(nextRange.from), to: iso(nextRange.to), label: nextRange.label });
  }

  function openCard(card: (typeof CARDS)[number]) {
    if (openId === card.id) {
      setOpenId("");
      return;
    }
    setOpenId(card.id);
    setReportId(card.reports[0].id);
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Livestock, poultry houses, sales, and expenses. The same reports open in the system reports center.</p>
      </div>
      {initial.error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{initial.error}</p> : null}
      <div className="space-y-3">
        {rows.map((row) => {
          const open = row.some((card) => card.id === openId);
          const card = CARDS.find((item) => item.id === openId);
          return (
            <div key={row[0].id}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {row.map((item) => {
                  const Icon = item.icon;
                  const selected = item.id === openId;
                  return (
                    <button key={item.id} type="button" onClick={() => openCard(item)} className={`relative flex h-[76px] items-center overflow-hidden rounded-2xl px-4 text-left shadow-sm transition ${selected ? "bg-[#0b2244] text-white shadow-md" : "bg-white text-slate-900 hover:shadow-md"}`}>
                      <Icon size={64} strokeWidth={1.25} className={`pointer-events-none absolute -right-1 -bottom-3 ${selected ? "text-white/15" : "text-[#0b2244]/10"}`} />
                      <span className="relative text-sm font-bold">{item.name}</span>
                    </button>
                  );
                })}
              </div>
              {open && card ? (
                <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {card.reports.length > 1 ? (
                      <label className="text-sm">Report
                        <select value={reportId} onChange={(event) => setReportId(event.target.value)} className={fieldClass}>
                          {card.reports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <label className="text-sm">Period
                      <select value={period} onChange={(event) => applyPeriod(event.target.value as ReportPeriod)} className={fieldClass}>
                        {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    {period === "custom" ? (
                      <>
                        <label className="text-sm">From<input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); applyPeriod("custom", event.target.value, toDate); }} className={fieldClass} /></label>
                        <label className="text-sm">To<input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); applyPeriod("custom", fromDate, event.target.value); }} className={fieldClass} /></label>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">{report.title} · {range.label}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={center} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-[#0b2244]">Open in Reports Center</Link>
                      <a href={pdf} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">Download PDF</a>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.totals.map((total) => <span key={total.label} className="rounded-full bg-slate-50 px-3 py-1 text-sm">{total.label}: {total.value}</span>)}
                  </div>
                  <div className="mt-3">
                    <PagedReportTable columns={report.columns} rows={report.rows} resetKey={`${reportId}|${from}|${to}`} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
