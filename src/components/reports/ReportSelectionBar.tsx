"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import {
  REPORT_PERIOD_OPTIONS,
  type ReportPeriod,
} from "@/lib/data/report-period";
import {
  REPORT_MODULE_OPTIONS,
  defaultReportId,
  reportsForModule,
  type ReportModuleId,
} from "@/lib/reports/registry";
import { ReportSurface } from "@/components/reports/report-ui";

type Props = {
  moduleId: ReportModuleId;
  reportId: string | null;
  period: ReportPeriod;
  label: string;
};

export function ReportSelectionBar({ moduleId, reportId, period, label }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const availableReports = useMemo(() => reportsForModule(moduleId), [moduleId]);

  function pushParams(next: {
    module?: ReportModuleId;
    report?: string | null;
    period?: ReportPeriod;
    from?: string | null;
    to?: string | null;
    view?: boolean;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextModule = next.module ?? moduleId;
    const nextReport = next.report === undefined ? reportId : next.report;
    const nextPeriod = next.period ?? period;

    params.set("module", nextModule);
    if (nextReport) params.set("report", nextReport);
    else params.delete("report");
    params.set("period", nextPeriod);

    if (nextPeriod === "custom") {
      const from = next.from === undefined ? searchParams.get("from") : next.from;
      const to = next.to === undefined ? searchParams.get("to") : next.to;
      if (from) params.set("from", from);
      else params.delete("from");
      if (to) params.set("to", to);
      else params.delete("to");
    } else {
      params.delete("from");
      params.delete("to");
    }

    if (next.view) params.set("view", "1");
    else params.delete("view");

    router.push(`?${params.toString()}`);
  }

  function onModuleChange(value: ReportModuleId) {
    pushParams({ module: value, report: defaultReportId(value), view: false });
  }

  function onReportChange(value: string) {
    pushParams({ report: value, view: false });
  }

  function onPeriodChange(value: ReportPeriod) {
    pushParams({
      period: value,
      from: value === "custom" ? searchParams.get("from") ?? "" : null,
      to: value === "custom" ? searchParams.get("to") ?? "" : null,
      view: false,
    });
  }

  function onViewReport() {
    if (!reportId || availableReports.length === 0) return;
    pushParams({ view: true });
  }

  const selectClass =
    "h-12 w-full appearance-none rounded-[14px] border border-white/80 bg-white/85 px-4 pr-10 text-[13.5px] font-medium text-navy shadow-[0_4px_14px_rgba(15,35,64,0.04)] outline-none backdrop-blur-xl transition focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10";

  return (
    <ReportSurface className="px-4 py-4 sm:px-5 sm:py-5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1.1fr_1fr_auto] lg:items-end">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Business Module</span>
          <div className="relative">
            <select
              value={moduleId}
              onChange={(event) => onModuleChange(event.target.value as ReportModuleId)}
              className={selectClass}
            >
              {REPORT_MODULE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </label>

        <label className="min-w-0">
          <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Report</span>
          <div className="relative">
            <select
              value={reportId ?? ""}
              onChange={(event) => onReportChange(event.target.value)}
              disabled={availableReports.length === 0}
              className={selectClass}
            >
              {availableReports.length === 0 ? (
                <option value="">No reports available</option>
              ) : (
                availableReports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.label}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </label>

        <label className="min-w-0">
          <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Period</span>
          <div className="space-y-2">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={period}
                onChange={(event) => onPeriodChange(event.target.value as ReportPeriod)}
                className={`${selectClass} pl-10`}
              >
                {REPORT_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === period ? label : option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            {period === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  defaultValue={searchParams.get("from") ?? ""}
                  onChange={(event) =>
                    pushParams({
                      period: "custom",
                      from: event.target.value,
                      to: searchParams.get("to"),
                      view: false,
                    })
                  }
                  className="h-11 rounded-[12px] border border-white/80 bg-white/85 px-3 text-[13px] text-navy outline-none"
                  aria-label="From date"
                />
                <input
                  type="date"
                  defaultValue={searchParams.get("to") ?? ""}
                  onChange={(event) =>
                    pushParams({
                      period: "custom",
                      from: searchParams.get("from"),
                      to: event.target.value,
                      view: false,
                    })
                  }
                  className="h-11 rounded-[12px] border border-white/80 bg-white/85 px-3 text-[13px] text-navy outline-none"
                  aria-label="To date"
                />
              </div>
            ) : null}
          </div>
        </label>

        <button
          type="button"
          onClick={onViewReport}
          disabled={!reportId || availableReports.length === 0}
          className="inline-flex h-12 items-center justify-center rounded-[14px] bg-[#0b2244] px-5 text-[13.5px] font-semibold text-white shadow-[0_10px_24px_rgba(11,34,68,0.18)] transition hover:bg-[#102a52] disabled:cursor-not-allowed disabled:opacity-45"
        >
          View Report
        </button>
      </div>
    </ReportSurface>
  );
}
