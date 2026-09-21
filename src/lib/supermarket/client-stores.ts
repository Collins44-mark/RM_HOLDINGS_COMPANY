"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  completeSaleAction,
  createExpenseAction,
  createPaymentAction,
  deletePaymentAction,
  deletePromotionAction,
  getDashboardMetricsAction,
  getReportAggregatesAction,
  listExpensesAction,
  listPaymentsAction,
  listPromotionTypesAction,
  listPromotionsAction,
  listSalesAction,
  processReturnAction,
  setPromotionPausedAction,
  updatePromotionTypeAction,
  upsertPromotionAction,
} from "@/actions/supermarket/sales";
import { listReturnsAction } from "@/actions/supermarket/reports";
import type {
  ExpenseRecord,
  PaymentRecord,
  Promotion,
  SupermarketSale,
} from "@/lib/supermarket/types";
import { refreshInventorySnapshot } from "@/lib/supermarket/inventory-store";

/**
 * CRITICAL: useSyncExternalStore requires getSnapshot to return a referentially
 * stable value when data has not changed. Returning a fresh object literal on
 * every call causes an infinite re-render loop → "Maximum update depth exceeded"
 * → supermarket error.tsx ("This page could not be loaded").
 */

/* ---------------- Sales store ---------------- */

type SalesSnapshot = {
  sales: SupermarketSale[];
  error: string | null;
  loaded: boolean;
};

let sales: SupermarketSale[] = [];
let salesError: string | null = null;
let salesLoaded = false;
let salesPromise: Promise<void> | null = null;
let salesSnapshot: SalesSnapshot = { sales, error: salesError, loaded: salesLoaded };
const salesListeners = new Set<() => void>();

function emitSales() {
  salesSnapshot = { sales, error: salesError, loaded: salesLoaded };
  salesListeners.forEach((l) => l());
}

export function subscribeSales(listener: () => void) {
  salesListeners.add(listener);
  return () => salesListeners.delete(listener);
}

export function getSalesSnapshot() {
  return salesSnapshot;
}

export async function refreshSales(input?: { from?: string; to?: string }) {
  const result = await listSalesAction({ ...input, limit: 200 });
  if (!result.ok) {
    salesError = result.error;
    sales = [];
  } else {
    sales = result.sales;
    salesError = null;
  }
  salesLoaded = true;
  emitSales();
}

export function ensureSalesLoaded(input?: { from?: string; to?: string }) {
  if (salesLoaded || salesPromise) return salesPromise;
  salesPromise = refreshSales(input).finally(() => {
    salesPromise = null;
  });
  return salesPromise;
}

export function useSupermarketSales(period?: { from?: string; to?: string }) {
  const state = useSyncExternalStore(subscribeSales, getSalesSnapshot, getSalesSnapshot);
  useEffect(() => {
    void ensureSalesLoaded(period);
  }, [period?.from, period?.to]);
  return state;
}

export async function completePosSale(input: Parameters<typeof completeSaleAction>[0]) {
  const result = await completeSaleAction(input);
  if (result.ok) {
    // Do not block the POS success UI on catalog/list refreshes.
    void Promise.all([refreshInventorySnapshot(), refreshSales()]);
  }
  return result;
}

export async function processSaleReturn(input: Parameters<typeof processReturnAction>[0]) {
  const result = await processReturnAction(input);
  if (result.ok) {
    await Promise.all([refreshInventorySnapshot(), refreshSales(), refreshReturns()]);
  }
  return result;
}

/* ---------------- Returns store ---------------- */

export type LiveSalesReturn = {
  id: string;
  returnNumber: string;
  saleId: string;
  invoiceNumber: string;
  customer: string;
  refundAmount: number;
  refundMethod: string;
  reason: string;
  createdAt: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    condition: string;
    reason: string;
    refundAmount: number;
  }[];
};

type ReturnsSnapshot = {
  returns: LiveSalesReturn[];
  error: string | null;
  loaded: boolean;
};

let returns: LiveSalesReturn[] = [];
let returnsError: string | null = null;
let returnsLoaded = false;
let returnsPromise: Promise<void> | null = null;
let returnsSnapshot: ReturnsSnapshot = { returns, error: returnsError, loaded: returnsLoaded };
const returnsListeners = new Set<() => void>();

function emitReturns() {
  returnsSnapshot = { returns, error: returnsError, loaded: returnsLoaded };
  returnsListeners.forEach((l) => l());
}

export function subscribeReturnsStore(listener: () => void) {
  returnsListeners.add(listener);
  return () => returnsListeners.delete(listener);
}

export function getReturnsStoreSnapshot() {
  return returnsSnapshot;
}

export async function refreshReturns() {
  const result = await listReturnsAction();
  if (!result.ok) {
    returnsError = result.error;
    returns = [];
  } else {
    returns = (result.returns as Record<string, unknown>[]).map((row) => {
      const sale = row.sm_sales as { invoice_number?: string; customer_name?: string } | null;
      const items = ((row.sm_sales_return_items ?? []) as Record<string, unknown>[]).map((item) => ({
        name: String(item.product_name ?? "Product"),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        condition: String(item.condition ?? "RESELLABLE"),
        reason: String(item.reason ?? ""),
        refundAmount: Number(item.refund_amount) || 0,
      }));
      return {
        id: String(row.id),
        returnNumber: String(row.return_number ?? row.id),
        saleId: String(row.sale_id),
        invoiceNumber: String(sale?.invoice_number ?? ""),
        customer: String(sale?.customer_name ?? "Walk-in Customer"),
        refundAmount: Number(row.refund_amount) || 0,
        refundMethod: String(row.refund_method ?? "Cash"),
        reason: String(row.reason ?? ""),
        createdAt: String(row.created_at ?? ""),
        items,
      };
    });
    returnsError = null;
  }
  returnsLoaded = true;
  emitReturns();
}

export function ensureReturnsLoaded() {
  if (returnsLoaded || returnsPromise) return returnsPromise;
  returnsPromise = refreshReturns().finally(() => {
    returnsPromise = null;
  });
  return returnsPromise;
}

export function useSupermarketReturns() {
  const state = useSyncExternalStore(subscribeReturnsStore, getReturnsStoreSnapshot, getReturnsStoreSnapshot);
  useEffect(() => {
    void ensureReturnsLoaded();
  }, []);
  return state;
}

/* ---------------- Promotions store ---------------- */

type PromotionTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
};

type PromotionsSnapshot = {
  promotions: Promotion[];
  types: PromotionTypeRow[];
  error: string | null;
  loaded: boolean;
};

let promotions: Promotion[] = [];
let promotionTypes: PromotionTypeRow[] = [];
let promotionsError: string | null = null;
let promotionsLoaded = false;
let promotionsPromise: Promise<void> | null = null;
let promotionsSnapshot: PromotionsSnapshot = {
  promotions,
  types: promotionTypes,
  error: promotionsError,
  loaded: promotionsLoaded,
};
const promotionListeners = new Set<() => void>();

function emitPromotions() {
  promotionsSnapshot = {
    promotions,
    types: promotionTypes,
    error: promotionsError,
    loaded: promotionsLoaded,
  };
  promotionListeners.forEach((l) => l());
}

export function subscribePromotionsStore(listener: () => void) {
  promotionListeners.add(listener);
  return () => promotionListeners.delete(listener);
}

export function getPromotionsStoreSnapshot() {
  return promotionsSnapshot;
}

export async function refreshPromotions() {
  try {
    const [promoRes, typeRes] = await Promise.all([listPromotionsAction(), listPromotionTypesAction()]);
    if (!promoRes.ok) {
      promotionsError = promoRes.error;
      promotions = [];
    } else {
      promotions = Array.isArray(promoRes.promotions) ? promoRes.promotions : [];
      promotionsError = null;
    }
    if (typeRes.ok) {
      promotionTypes = Array.isArray(typeRes.types) ? typeRes.types : [];
    }
  } catch (error) {
    promotionsError = error instanceof Error ? error.message : "Failed to load promotions.";
    promotions = [];
  }
  promotionsLoaded = true;
  emitPromotions();
}

export function ensurePromotionsLoaded() {
  if (promotionsLoaded || promotionsPromise) return promotionsPromise;
  promotionsPromise = refreshPromotions().finally(() => {
    promotionsPromise = null;
  });
  return promotionsPromise;
}

export function useSupermarketPromotions() {
  const state = useSyncExternalStore(
    subscribePromotionsStore,
    getPromotionsStoreSnapshot,
    getPromotionsStoreSnapshot,
  );
  useEffect(() => {
    void ensurePromotionsLoaded();
  }, []);
  return state;
}

export async function savePromotion(input: Parameters<typeof upsertPromotionAction>[0]) {
  const result = await upsertPromotionAction(input);
  if (result.ok) await refreshPromotions();
  return result;
}

export async function pausePromotion(id: string, isPaused: boolean) {
  const result = await setPromotionPausedAction(id, isPaused);
  if (result.ok) await refreshPromotions();
  return result;
}

export async function removePromotion(id: string) {
  const result = await deletePromotionAction(id);
  if (result.ok) await refreshPromotions();
  return result;
}

/* ---------------- Finance store ---------------- */

type FinanceSnapshot = {
  expenses: ExpenseRecord[];
  payments: PaymentRecord[];
  error: string | null;
  loaded: boolean;
};

let expenses: ExpenseRecord[] = [];
let payments: PaymentRecord[] = [];
let financeError: string | null = null;
let financeLoaded = false;
let financePromise: Promise<void> | null = null;
let financeSnapshot: FinanceSnapshot = {
  expenses,
  payments,
  error: financeError,
  loaded: financeLoaded,
};
const financeListeners = new Set<() => void>();

function emitFinance() {
  financeSnapshot = {
    expenses,
    payments,
    error: financeError,
    loaded: financeLoaded,
  };
  financeListeners.forEach((l) => l());
}

export function subscribeFinanceStore(listener: () => void) {
  financeListeners.add(listener);
  return () => financeListeners.delete(listener);
}

export function getFinanceStoreSnapshot() {
  return financeSnapshot;
}

export async function refreshFinance() {
  try {
    const [expRes, payRes] = await Promise.all([listExpensesAction(), listPaymentsAction()]);
    if (!expRes.ok) {
      financeError = expRes.error;
      expenses = [];
    } else {
      expenses = Array.isArray(expRes.expenses) ? expRes.expenses : [];
      financeError = null;
    }
    if (!payRes.ok) {
      financeError = payRes.error;
      payments = [];
    } else {
      payments = Array.isArray(payRes.payments) ? payRes.payments : [];
    }
  } catch (error) {
    financeError = error instanceof Error ? error.message : "Failed to load finance records.";
    expenses = [];
    payments = [];
  }
  financeLoaded = true;
  emitFinance();
}

export function ensureFinanceLoaded() {
  if (financeLoaded || financePromise) return financePromise;
  financePromise = refreshFinance().finally(() => {
    financePromise = null;
  });
  return financePromise;
}

export function useSupermarketFinance() {
  const state = useSyncExternalStore(subscribeFinanceStore, getFinanceStoreSnapshot, getFinanceStoreSnapshot);
  useEffect(() => {
    void ensureFinanceLoaded();
  }, []);
  return state;
}

export async function recordExpense(input: Parameters<typeof createExpenseAction>[0]) {
  const result = await createExpenseAction(input);
  if (result.ok) await refreshFinance();
  return result;
}

export async function recordPayment(input: Parameters<typeof createPaymentAction>[0]) {
  const result = await createPaymentAction(input);
  if (result.ok) await refreshFinance();
  return result;
}

export async function removePayment(id: string) {
  const result = await deletePaymentAction(id);
  if (result.ok) await refreshFinance();
  return result;
}

export async function updatePromotionType(input: Parameters<typeof updatePromotionTypeAction>[0]) {
  const result = await updatePromotionTypeAction(input);
  if (result.ok) await refreshPromotions();
  return result;
}

export { getDashboardMetricsAction, getReportAggregatesAction };
