"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, DoorOpen, FileText, Receipt, Users, Wallet } from "lucide-react";
import { downloadPdfBytes } from "@/lib/pdf/report-document";
import { EXPENSE_CATEGORIES } from "@/lib/property/expenses";
import { buildPropertyReportPdf } from "@/lib/property/report-pdf";
import { REPORT_MODULES, REPORT_TYPES, reportFilters, type ReportOption } from "@/lib/property/report-types";

const ICONS = {
  properties: Building2,
  units: DoorOpen,
  tenants: Users,
  contracts: FileText,
  invoices: Receipt,
  halls: CalendarDays,
  expenses: Wallet,
} as const;

const emptyFilters = {
  propertyId: "",
  unitId: "",
  tenantId: "",
  hallId: "",
  category: "",
  status: "",
  from: "",
  to: "",
};

export default function ReportsView({ options }: { options: { properties: ReportOption[]; units: ReportOption[]; tenants: ReportOption[]; halls: ReportOption[] } }) {
  const [moduleId, setModuleId] = useState("");
  const [report, setReport] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const moduleName = REPORT_MODULES.find((item) => item.id === moduleId);
  const visible = reportFilters(moduleId, report);
  const units = useMemo(() => options.units.filter((unit) => !filters.propertyId || unit.property_id === filters.propertyId), [options.units, filters.propertyId]);

  function openModule(id: string) {
    setModuleId(id);
    setReport(REPORT_TYPES[id][0].id);
    setFilters(emptyFilters);
    setState("idle");
    setError("");
  }

  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (state !== "idle") return;
    setState("generating");
    setError("");
    try {
      const response = await fetch("/api/property/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleId, report, ...filters }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.data) {
        setError(body.error || "The report could not be generated");
        setState("idle");
        return;
      }
      const bytes = buildPropertyReportPdf(body.data);
      downloadPdfBytes(bytes, `RM-Holdings-${moduleId}-${report}.pdf`);
      setState("downloaded");
      setTimeout(() => setState("idle"), 900);
    } catch (failure: any) {
      setError(failure?.message || "The report could not be generated");
      setState("idle");
    }
  }

  return (
    <main className="pb-10 text-slate-900">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold">Reports</h1>
        <p className="text-sm text-slate-500">Choose a module, select a report, and download a PDF.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_MODULES.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <button key={item.id} type="button" onClick={() => openModule(item.id)} className="rounded-2xl bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#0b2244]"><Icon size={18} /></span>
              <span className="mt-4 block text-lg font-bold">{item.name}</span>
              <span className="mt-1 block text-sm text-slate-500">{item.description}</span>
            </button>
          );
        })}
      </div>

      {moduleName ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => state === "idle" && setModuleId("")}>
          <form onSubmit={download} onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold">{moduleName.name}</h2>
            <p className="text-sm text-slate-500">{moduleName.description}</p>
            <label className="mt-4 block text-sm">Report
              <select value={report} onChange={(event) => { setReport(event.target.value); setError(""); }} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                {REPORT_TYPES[moduleId].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {visible.dates ? (
                <>
                  <label className="text-sm">Start date<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                  <label className="text-sm">End date<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                </>
              ) : null}
              {visible.property ? (
                <label className="text-sm">Property
                  <select required={visible.propertyRequired} value={filters.propertyId} onChange={(event) => setFilters({ ...filters, propertyId: event.target.value, unitId: "" })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    {visible.propertyRequired ? <option value="">Select property</option> : <option value="">All properties</option>}
                    {options.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                  </select>
                </label>
              ) : null}
              {visible.unit ? (
                <label className="text-sm">Unit
                  <select value={filters.unitId} onChange={(event) => setFilters({ ...filters, unitId: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    <option value="">All units</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </label>
              ) : null}
              {visible.tenant ? (
                <label className="text-sm">Tenant
                  <select required={visible.tenantRequired} value={filters.tenantId} onChange={(event) => setFilters({ ...filters, tenantId: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    {visible.tenantRequired ? <option value="">Select tenant</option> : <option value="">All tenants</option>}
                    {options.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                  </select>
                </label>
              ) : null}
              {visible.hall ? (
                <label className="text-sm">Hall
                  <select value={filters.hallId} onChange={(event) => setFilters({ ...filters, hallId: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    <option value="">All halls</option>
                    {options.halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}
                  </select>
                </label>
              ) : null}
              {visible.category ? (
                <label className="text-sm">Category
                  <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    <option value="">All categories</option>
                    {EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              ) : null}
              {visible.status ? (
                <label className="text-sm">Status
                  <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">
                    <option value="">All statuses</option>
                    {(moduleId === "units" ? ["Occupied", "Vacant", "Maintenance"] : moduleId === "contracts" ? ["Pending", "Active", "Completed", "Terminated"] : moduleId === "invoices" ? ["Paid", "Unpaid", "Partially Paid", "Overdue", "Cancelled"] : moduleId === "halls" ? ["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"] : ["Pending", "Partially Paid", "Paid", "Overdue", "Cancelled"]).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => state === "idle" && setModuleId("")} className="rounded-xl px-4 py-2 text-slate-600">Close</button>
              <button type="submit" disabled={state === "generating"} className={`flex min-w-[140px] items-center justify-center rounded-xl px-4 py-2 font-semibold text-white ${state === "downloaded" ? "bg-emerald-600" : "bg-[#0b2244]"}`}>
                {state === "generating" ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : state === "downloaded" ? "Downloaded" : "Download PDF"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
