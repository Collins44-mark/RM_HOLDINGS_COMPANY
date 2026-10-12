"use server";

import { getBusinessUnitByCode } from "@/lib/data/business-units";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { isRiceMissingRelation, requireRiceContext, riceActionError } from "@/lib/rice/access";
import { loadRiceExpenses, loadRiceItems, loadRicePurchases, loadRiceSales, loadRiceServiceIncome } from "@/lib/rice/queries";
import { RICE_LEDGER_UNAVAILABLE, type RiceMetric, type RiceOverviewView } from "@/lib/rice/overview";

function ok<T>(value: T, hint = ""): RiceMetric<T> {
  return { status: "ok", value, hint };
}

function unavailable<T = number>(hint = RICE_LEDGER_UNAVAILABLE): RiceMetric<T> {
  return { status: "unavailable", value: null, hint };
}

function empty<T>(hint: string): RiceMetric<T> {
  return { status: "empty", value: null, hint };
}

function todayLabel(now: Date) {
  return now.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export async function getRiceOverviewAction(input: {
  period?: string;
  from?: string;
  to?: string;
} = {}): Promise<{ ok: true; overview: RiceOverviewView } | { ok: false; error: string }> {
  try {
    const ctx = await requireRiceContext();
    const unit = await getBusinessUnitByCode("rice");
    const now = new Date();
    const period = parseReportPeriod(input.period ?? "this-month") as ReportPeriod;
    const range = reportPeriodRange(period, now, { from: input.from, to: input.to });
    const location = unit?.storedLocation?.trim() || null;
    const from = dateIso(range.from);
    const to = dateIso(range.to);
    const today = dateIso(now);

    const base = {
      unitName: unit?.name || "Rice Mill & Warehouse",
      location,
      isActive: unit ? unit.isActive : null,
      periodLabel: range.label,
      todayLabel: todayLabel(now),
    };

    try {
      const [items, purchases, sales, services, expenses] = await Promise.all([
        loadRiceItems(ctx),
        loadRicePurchases(ctx, from, to),
        loadRiceSales(ctx, from, to),
        loadRiceServiceIncome(ctx, from, to),
        loadRiceExpenses(ctx, from, to),
      ]);

      const paddyKg = items.filter((row) => row.kind === "PADDY").reduce((sum, row) => sum + row.qtyKg, 0);
      const riceItems = items.filter((row) => row.kind === "RICE" || row.kind === "BROKEN");
      const riceKg = riceItems.reduce((sum, row) => sum + row.qtyKg, 0);
      const salesTotal = sales.reduce((sum, row) => sum + row.total, 0);
      const serviceTotal = services.reduce((sum, row) => sum + row.amount, 0);
      const purchaseTotal = purchases.reduce((sum, row) => sum + row.total, 0);
      const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
      const net = salesTotal + serviceTotal - purchaseTotal - expenseTotal;

      const { data: milledRows, error: milledError } = await ctx.supabase
        .from("rice_mill_batches")
        .select("input_qty_kg")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("is_active", true)
        .eq("produced_on", today);
      if (milledError && isRiceMissingRelation(milledError)) {
        throw milledError;
      }
      const milledToday = (milledRows ?? []).reduce((sum, row) => sum + (Number(row.input_qty_kg) || 0), 0);

      const gradeRows = riceItems
        .filter((row) => row.qtyKg > 0)
        .map((row) => ({ name: row.name, quantityKg: row.qtyKg, share: riceKg > 0 ? (row.qtyKg / riceKg) * 100 : 0 }));
      const stockRows = items
        .filter((row) => row.qtyKg > 0)
        .map((row) => {
          const total = items.reduce((sum, item) => sum + item.qtyKg, 0);
          return { name: row.name, quantityKg: row.qtyKg, share: total > 0 ? (row.qtyKg / total) * 100 : 0 };
        });
      const serviceGroups = new Map<string, number>();
      for (const row of services) {
        serviceGroups.set(row.kind, (serviceGroups.get(row.kind) ?? 0) + row.amount);
      }
      const serviceRows = [...serviceGroups.entries()].map(([name, amount]) => ({
        name: name.charAt(0) + name.slice(1).toLowerCase(),
        amount,
        share: serviceTotal > 0 ? (amount / serviceTotal) * 100 : 0,
      }));

      const overview: RiceOverviewView = {
        ...base,
        companyPaddyKg: ok(paddyKg, paddyKg === 0 ? "None on hand." : ""),
        riceStockKg: ok(riceKg, riceKg === 0 ? "None on hand." : ""),
        totalSales: ok(salesTotal, salesTotal === 0 ? `No sales in ${range.label}.` : ""),
        milledTodayKg: ok(milledToday, milledToday === 0 ? "No milling today." : ""),
        netProfit: ok(net),
        stockByGrade: gradeRows.length ? ok(gradeRows) : empty("No rice on hand."),
        currentStock: stockRows.length ? ok(stockRows) : empty("No company stock on hand."),
        serviceIncome: serviceRows.length ? ok(serviceRows) : empty(`No service income in ${range.label}.`),
        serviceIncomeTotal: ok(serviceTotal),
      };
      return { ok: true as const, overview };
    } catch (inner) {
      const message = inner instanceof Error ? inner.message : "";
      if (isRiceMissingRelation(inner as { message?: string }) || /not in the live database/i.test(message)) {
        return {
          ok: true as const,
          overview: {
            ...base,
            companyPaddyKg: unavailable(),
            riceStockKg: unavailable(),
            totalSales: unavailable(`No posted rice sales ledger for ${range.label}.`),
            milledTodayKg: unavailable("No milling production records for today."),
            netProfit: unavailable("Net profit cannot be calculated until rice sales and costs are recorded."),
            stockByGrade: unavailable(),
            currentStock: unavailable(),
            serviceIncome: unavailable(`No posted rice service-income records for ${range.label}.`),
            serviceIncomeTotal: unavailable(),
          },
        };
      }
      throw inner;
    }
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}
