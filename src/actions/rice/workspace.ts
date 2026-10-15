"use server";

import { requireAuth } from "@/lib/auth/session";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { RiceError, requireAnyRicePermission, riceActionError } from "@/lib/rice/access";
import {
  loadRiceBatches,
  loadRiceExpenses,
  loadRiceItems,
  loadRiceMovements,
  loadRiceParties,
  loadRicePurchases,
  loadRiceSales,
  loadRiceServiceIncome,
  loadRiceStorage,
  riceCaps,
  applyRiceInventoryValues,
  loadRiceLedgerSummary,
  loadRiceKindMovements,
} from "@/lib/rice/queries";
import type {
  RiceCaps,
  RiceExpense,
  RiceFinanceSummary,
  RiceItem,
  RiceMillBatch,
  RiceParty,
  RicePurchase,
  RiceSale,
  RiceServiceIncome,
  RiceStockMovement,
  RiceStorageAccount,
  RiceStorageMovement,
  RiceWarehouseMovement,
  RiceItemKind,
} from "@/lib/rice/types";
import { parseRiceWarehouseKind } from "@/lib/rice/warehouse-kind";
import type { PageMeta } from "@/lib/pagination";

function dateIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function rangeFrom(input: { period?: string; from?: string; to?: string }) {
  const period = parseReportPeriod(input.period ?? "this-month") as ReportPeriod;
  const range = reportPeriodRange(period, new Date(), { from: input.from, to: input.to });
  return { period, range, from: dateIso(range.from), to: dateIso(range.to) };
}

export type RicePurchasesWorkspace = {
  items: RiceItem[];
  parties: RiceParty[];
  purchases: RicePurchase[];
  caps: RiceCaps;
  periodLabel: string;
  listPage: PageMeta;
};

export type RiceMillingWorkspace = {
  items: RiceItem[];
  batches: RiceMillBatch[];
  caps: RiceCaps;
  periodLabel: string;
  listPage: PageMeta;
};

export type RiceWarehouseWorkspace = {
  items: RiceItem[];
  movements: RiceStockMovement[];
  caps: RiceCaps;
  listPage: PageMeta;
};

export type RiceWarehouseKindWorkspace = {
  kind: RiceItemKind;
  items: RiceItem[];
  movements: RiceWarehouseMovement[];
  totalQtyKg: number;
  totalValueTzs: number;
  listPage: PageMeta;
};

export type RiceStorageWorkspace = {
  parties: RiceParty[];
  accounts: RiceStorageAccount[];
  movements: RiceStorageMovement[];
  services: RiceServiceIncome[];
  caps: RiceCaps;
  periodLabel: string;
  listPage: PageMeta;
};

export type RiceSalesWorkspace = {
  items: RiceItem[];
  parties: RiceParty[];
  sales: RiceSale[];
  caps: RiceCaps;
  periodLabel: string;
  listPage: PageMeta;
};

export type RiceFinanceWorkspace = {
  summary: RiceFinanceSummary;
  purchases: RicePurchase[];
  sales: RiceSale[];
  services: RiceServiceIncome[];
  expenses: RiceExpense[];
  caps: RiceCaps;
  periodLabel: string;
  listPage: PageMeta;
};

export type RiceReportsWorkspace = RiceFinanceWorkspace & {
  items: RiceItem[];
  batches: RiceMillBatch[];
  accounts: RiceStorageAccount[];
  storageMovements: RiceStorageMovement[];
};

export type RiceSettingsWorkspace = {
  items: RiceItem[];
  caps: RiceCaps;
};

export async function loadRicePurchasesWorkspaceAction(
  input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  try {
    const ctx = await requireAnyRicePermission(["rice.purchases.view", "rice.purchases.create", "rice.farmers.view"]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [items, parties, purchases] = await Promise.all([
      loadRiceItems(ctx),
      loadRiceParties(ctx),
      loadRicePurchases(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
    ]);
    return {
      ok: true as const,
      workspace: {
        items,
        parties: parties.filter((row) => row.kind === "SUPPLIER" || row.kind === "BOTH"),
        purchases: purchases.rows,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: purchases.page,
      } satisfies RicePurchasesWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceMillingWorkspaceAction(
  input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  try {
    const ctx = await requireAnyRicePermission(["rice.milling.view", "rice.milling.create"]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [items, batches] = await Promise.all([
      loadRiceItems(ctx),
      loadRiceBatches(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
    ]);
    return {
      ok: true as const,
      workspace: {
        items,
        batches: batches.rows,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: batches.page,
      } satisfies RiceMillingWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceWarehouseWorkspaceAction(input: { page?: number; pageSize?: number } = {}) {
  try {
    const ctx = await requireAnyRicePermission(["rice.warehouse.view", "rice.stock.view", "rice.stock.edit"]);
    const user = await requireAuth();
    const to = dateIso(new Date());
    const [items, movements, ledger] = await Promise.all([
      loadRiceItems(ctx),
      loadRiceMovements(ctx, { page: input.page, pageSize: input.pageSize }),
      loadRiceLedgerSummary(ctx, "2000-01-01", to),
    ]);
    return {
      ok: true as const,
      workspace: {
        items: applyRiceInventoryValues(items, ledger),
        movements: movements.rows,
        caps: riceCaps(user),
        listPage: movements.page,
      } satisfies RiceWarehouseWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceWarehouseKindWorkspaceAction(
  input: { kind: string; page?: number; pageSize?: number },
): Promise<{ ok: true; workspace: RiceWarehouseKindWorkspace } | { ok: false; error: string }> {
  try {
    const kind = parseRiceWarehouseKind(input.kind);
    if (!kind) return { ok: false as const, error: "Unknown warehouse category." };
    const ctx = await requireAnyRicePermission(["rice.warehouse.view", "rice.stock.view", "rice.stock.edit"]);
    const to = dateIso(new Date());
    const [allItems, ledger] = await Promise.all([
      loadRiceItems(ctx),
      loadRiceLedgerSummary(ctx, "2000-01-01", to),
    ]);
    const items = applyRiceInventoryValues(allItems, ledger).filter((row) => row.kind === kind);
    const movements = await loadRiceKindMovements(
      ctx,
      items.map((row) => row.id),
      { page: input.page, pageSize: input.pageSize },
    );
    return {
      ok: true as const,
      workspace: {
        kind,
        items,
        movements: movements.rows,
        totalQtyKg: items.reduce((sum, row) => sum + row.qtyKg, 0),
        totalValueTzs: items.reduce((sum, row) => sum + row.valueTzs, 0),
        listPage: movements.page,
      } satisfies RiceWarehouseKindWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceStorageWorkspaceAction(
  input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  try {
    const ctx = await requireAnyRicePermission([
      "rice.storage.view",
      "rice.storage.create",
      "rice.warehouse.view",
      "rice.warehouse.receive",
      "rice.warehouse.release",
    ]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [parties, storage, services] = await Promise.all([
      loadRiceParties(ctx),
      loadRiceStorage(ctx, { page: input.page, pageSize: input.pageSize }),
      loadRiceServiceIncome(ctx, from, to),
    ]);
    return {
      ok: true as const,
      workspace: {
        parties: parties.filter((row) => row.kind === "CUSTOMER" || row.kind === "BOTH"),
        accounts: storage.accounts,
        movements: storage.movements,
        services,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: storage.page,
      } satisfies RiceStorageWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceSalesWorkspaceAction(
  input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  try {
    const ctx = await requireAnyRicePermission(["rice.sales.view", "rice.sales.create", "rice.payments.view"]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [items, parties, sales] = await Promise.all([
      loadRiceItems(ctx),
      loadRiceParties(ctx),
      loadRiceSales(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
    ]);
    return {
      ok: true as const,
      workspace: {
        items: items.filter((row) => row.kind !== "PADDY"),
        parties: parties.filter((row) => row.kind === "CUSTOMER" || row.kind === "BOTH"),
        sales: sales.rows,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: sales.page,
      } satisfies RiceSalesWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceFinanceWorkspaceAction(
  input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  try {
    const ctx = await requireAnyRicePermission([
      "rice.finance.view",
      "rice.payments.view",
      "rice.payments.create",
      "rice.expenses.view",
      "rice.expenses.create",
    ]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [purchases, sales, services, expenses, ledger] = await Promise.all([
      loadRicePurchases(ctx, from, to, "all"),
      loadRiceSales(ctx, from, to, "all"),
      loadRiceServiceIncome(ctx, from, to),
      loadRiceExpenses(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
      loadRiceLedgerSummary(ctx, from, to),
    ]);
    return {
      ok: true as const,
      workspace: {
        summary: ledger,
        purchases: purchases.rows,
        sales: sales.rows,
        services,
        expenses: expenses.rows,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: expenses.page,
      } satisfies RiceFinanceWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceReportsWorkspaceAction(input: { period?: string; from?: string; to?: string } = {}) {
  try {
    const ctx = await requireAnyRicePermission(["rice.reports.view", "rice.sales.view", "rice.purchases.view", "rice.finance.view"]);
    const user = await requireAuth();
    const { range, from, to } = rangeFrom(input);
    const [items, purchases, batches, sales, services, expenses, storage, ledger] = await Promise.all([
      loadRiceItems(ctx),
      loadRicePurchases(ctx, from, to, "all"),
      loadRiceBatches(ctx, from, to, "all"),
      loadRiceSales(ctx, from, to, "all"),
      loadRiceServiceIncome(ctx, from, to),
      loadRiceExpenses(ctx, from, to, "all"),
      loadRiceStorage(ctx, "all"),
      loadRiceLedgerSummary(ctx, from, to),
    ]);
    return {
      ok: true as const,
      workspace: {
        items: applyRiceInventoryValues(items, ledger),
        purchases: purchases.rows,
        batches: batches.rows,
        sales: sales.rows,
        services,
        expenses: expenses.rows,
        accounts: storage.accounts,
        storageMovements: storage.movements,
        summary: ledger,
        caps: riceCaps(user),
        periodLabel: range.label,
        listPage: expenses.page,
      } satisfies RiceReportsWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadRiceSettingsWorkspaceAction() {
  try {
    const ctx = await requireAnyRicePermission(["rice.settings.view", "rice.settings.manage"]);
    const user = await requireAuth();
    const items = await loadRiceItems(ctx, true);
    return { ok: true as const, workspace: { items, caps: riceCaps(user) } satisfies RiceSettingsWorkspace };
  } catch (error) {
    if (error instanceof RiceError && error.code === "NOT_CONFIGURED") {
      return { ok: false as const, error: error.message };
    }
    return { ok: false as const, error: riceActionError(error) };
  }
}
