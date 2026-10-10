"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { getBusinessUnitByCode } from "@/lib/data/business-units";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { RICE_LEDGER_UNAVAILABLE, type RiceMetric, type RiceOverviewView } from "@/lib/rice/overview";
import { schoolActionError, SchoolError } from "@/lib/school/access";

function unavailable<T = number>(hint = RICE_LEDGER_UNAVAILABLE): RiceMetric<T> {
  return { status: "unavailable", value: null, hint };
}

function todayLabel(now: Date) {
  return now.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function getRiceOverviewAction(input: {
  period?: string;
  from?: string;
  to?: string;
} = {}): Promise<{ ok: true; overview: RiceOverviewView } | { ok: false; error: string }> {
  try {
    const user = await requireAuth();
    const hasModule =
      isOwnerRole(user.roleCode) ||
      user.modules.includes("rice") ||
      user.businessUnits.some((unit) => unit.code === "rice");
    if (!hasModule) {
      throw new SchoolError("You do not have access to Rice Mill & Warehouse.", "UNAUTHORIZED");
    }

    const unit = await getBusinessUnitByCode("rice");
    const now = new Date();
    const period = parseReportPeriod(input.period ?? "this-month") as ReportPeriod;
    const range = reportPeriodRange(period, now, { from: input.from, to: input.to });
    const location = unit?.storedLocation?.trim() || null;

    const overview: RiceOverviewView = {
      unitName: unit?.name || "Rice Mill & Warehouse",
      location,
      isActive: unit ? unit.isActive : null,
      periodLabel: range.label,
      todayLabel: todayLabel(now),
      companyPaddyKg: unavailable(),
      riceStockKg: unavailable(),
      totalSales: unavailable(`No posted rice sales ledger for ${range.label}.`),
      milledTodayKg: unavailable("No milling production records for today."),
      netProfit: unavailable(`Net profit cannot be calculated until rice sales and costs are recorded.`),
      stockByGrade: unavailable(),
      currentStock: unavailable(),
      serviceIncome: unavailable("No posted rice service-income records for this month."),
      serviceIncomeTotal: unavailable(),
    };

    return { ok: true as const, overview };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
