"use server";

import { getBusinessUnitByCode } from "@/lib/data/business-units";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { FarmError, farmActionError, isFarmMissingRelation, requireFarmContext } from "@/lib/farm/access";
import { loadFarmActivity, loadFarmJobs, loadFarmLedgerSummary, loadFarmTractors } from "@/lib/farm/queries";
import type { FarmActivityRow, FarmJob, FarmTractor } from "@/lib/farm/types";
import type { FarmFinanceSummary } from "@/lib/farm/accounting";

const FARM_LEDGER_UNAVAILABLE =
  "Farm & Tractor Services ledgers are not in the live database yet. Figures are withheld until those records exist.";

export type FarmMetricStatus = "ok" | "empty" | "unavailable" | "error";

export type FarmMetric<T> = {
  status: FarmMetricStatus;
  value: T | null;
  hint: string;
};

export type FarmOverviewView = {
  unitName: string;
  location: string | null;
  isActive: boolean | null;
  periodLabel: string;
  todayLabel: string;
  tractorCount: FarmMetric<number>;
  tractorInUse: number;
  tractorAvailable: number;
  completedJobs: FarmMetric<number>;
  customersServed: FarmMetric<number>;
  serviceIncome: FarmMetric<number>;
  tractorSpend: FarmMetric<number>;
  tractors: FarmTractor[];
  jobs: FarmJob[];
  activity: FarmActivityRow[];
  summary: FarmFinanceSummary | null;
};

function ok<T>(value: T, hint = ""): FarmMetric<T> {
  return { status: "ok", value, hint };
}

function unavailable<T = number>(hint = FARM_LEDGER_UNAVAILABLE): FarmMetric<T> {
  return { status: "unavailable", value: null, hint };
}

function dateIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function todayLabel(now: Date) {
  return now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export async function getFarmOverviewAction(input: {
  period?: string;
  from?: string;
  to?: string;
} = {}): Promise<{ ok: true; overview: FarmOverviewView } | { ok: false; error: string }> {
  try {
    const ctx = await requireFarmContext();
    const unit = await getBusinessUnitByCode("farm");
    const now = new Date();
    const period = parseReportPeriod(input.period ?? "this-month") as ReportPeriod;
    const range = reportPeriodRange(period, now, { from: input.from, to: input.to });
    const from = dateIso(range.from);
    const to = dateIso(range.to);
    const base = {
      unitName: unit?.name || "Farm & Tractor Services",
      location: unit?.storedLocation?.trim() || null,
      isActive: unit ? unit.isActive : null,
      periodLabel: range.label,
      todayLabel: todayLabel(now),
    };

    try {
      const [tractors, jobs, activity, summary] = await Promise.all([
        loadFarmTractors(ctx),
        loadFarmJobs(ctx, from, to, "all"),
        loadFarmActivity(ctx, 8),
        loadFarmLedgerSummary(ctx, from, to),
      ]);
      const live = tractors.filter((row) => row.isActive);
      const inUse = live.filter((row) => row.status === "IN_USE").length;
      const resting = live.filter((row) => row.status === "AVAILABLE").length;
      const overview: FarmOverviewView = {
        ...base,
        tractorCount: ok(live.length),
        tractorInUse: inUse,
        tractorAvailable: resting,
        completedJobs: ok(summary.completedJobs),
        customersServed: ok(summary.customersServed),
        serviceIncome: ok(summary.serviceIncome),
        tractorSpend: ok(summary.tractorExpense),
        tractors: live.slice(0, 8),
        jobs: jobs.jobs.slice(0, 8),
        activity,
        summary,
      };
      return { ok: true as const, overview };
    } catch (inner) {
      const message = inner instanceof Error ? inner.message : "";
      const unconfigured =
        (inner instanceof FarmError && inner.code === "NOT_CONFIGURED") ||
        isFarmMissingRelation(inner as { message?: string; code?: string }) ||
        /not in the live database/i.test(message);
      if (unconfigured) {
        return {
          ok: true as const,
          overview: {
            ...base,
            tractorCount: unavailable(),
            tractorInUse: 0,
            tractorAvailable: 0,
            completedJobs: unavailable(),
            customersServed: unavailable(),
            serviceIncome: unavailable(),
            tractorSpend: unavailable(),
            tractors: [],
            jobs: [],
            activity: [],
            summary: null,
          },
        };
      }
      throw inner;
    }
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}
