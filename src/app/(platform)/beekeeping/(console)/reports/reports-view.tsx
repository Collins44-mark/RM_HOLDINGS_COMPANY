"use client";

import { useState } from "react";
import { FileText, Flower2, Hexagon, Landmark, Package, Wallet } from "lucide-react";
import type { BeeDirectory } from "@/lib/beekeeping/directory";
import { beePeriodWindow } from "@/lib/beekeeping/period";
import { PagedReportTable } from "@/components/ui/PagedReportTable";
import { buildBeeReport } from "@/lib/beekeeping/reports";

const CARDS = [
  { id: "hives", name: "Beehives", icon: Hexagon, reports: [{ id: "bee-hives", label: "All Beehives" }, { id: "bee-hive-details", label: "Beehive Details" }] },
  { id: "harvests", name: "Harvests", icon: Flower2, reports: [{ id: "bee-harvests", label: "Honey Harvest Records" }, { id: "bee-production", label: "Honey Production Summary" }] },
  { id: "sales", name: "Sales", icon: FileText, reports: [{ id: "bee-sales", label: "Honey Sales" }] },
  { id: "stock", name: "Honey Stock", icon: Package, reports: [{ id: "bee-stock", label: "Honey Stock" }] },
  { id: "expenses", name: "Expenses", icon: Wallet, reports: [{ id: "bee-expenses", label: "Beekeeping Expenses" }] },
  { id: "finance", name: "Finance", icon: Landmark, reports: [{ id: "bee-financial", label: "Beekeeping Financial Summary" }] },
] as const;

const fieldClass = "mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300";

export default function ReportsView({ initial }: { initial: BeeDirectory }) {
  const [openId, setOpenId] = useState("");
  const [reportId, setReportId] = useState("bee-hives");
  const [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const range = beePeriodWindow(period === "custom" && fromDate && toDate && fromDate <= toDate ? "custom" : period === "custom" ? "month" : period, fromDate, toDate);
  const report = buildBeeReport(reportId, initial, range.from, range.to);
  const pdf = `/api/beekeeping/reports/pdf?report=${encodeURIComponent(reportId)}&from=${range.from}&to=${range.to}&period=${encodeURIComponent(range.label)}`;
  const rows: (typeof CARDS)[number][][] = [];
  for (let index = 0; index < CARDS.length; index += 3) rows.push(CARDS.slice(index, index + 3));

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
        <p className="mt-1 text-sm text-slate-500">Beehives, harvests, stock, sales, and expenses for this business.</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const open = row.some((card) => card.id === openId);
          const card = CARDS.find((item) => item.id === openId);
          return (
            <div key={row[0].id}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      <select value={period} onChange={(event) => setPeriod(event.target.value)} className={fieldClass}>
                        <option value="week">This Week</option>
                        <option value="today">Today</option>
                        <option value="month">This Month</option>
                        <option value="year">This Year</option>
                        <option value="custom">Custom range</option>
                      </select>
                    </label>
                    {period === "custom" ? (
                      <>
                        <label className="text-sm">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={fieldClass} /></label>
                        <label className="text-sm">To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={fieldClass} /></label>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">{report.title} · {range.label}</p>
                    <a href={pdf} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">Download PDF</a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.totals.map((total) => <span key={total.label} className="rounded-full bg-slate-50 px-3 py-1 text-sm">{total.label}: {total.value}</span>)}
                  </div>
                  <div className="mt-3">
                    <PagedReportTable columns={report.columns} rows={report.rows} resetKey={`${reportId}|${range.from}|${range.to}`} />
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
