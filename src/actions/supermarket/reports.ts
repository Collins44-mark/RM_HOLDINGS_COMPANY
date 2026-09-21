"use server";

import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
} from "@/lib/supermarket/access";
import { loadInventoryValuation } from "@/lib/supermarket/queries";
import { mapExpense } from "@/lib/supermarket/mappers";
import {
  formatSalesDate,
  resolveSalesPeriod,
  type SalesDateRange,
  type SalesPeriodPreset,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";
import type {
  InventoryReportData,
  ProfitLossReportData,
  PurchaseReportData,
  SalesReportData,
  SalesReportFilters,
  InventoryReportFilters,
  PurchaseReportFilters,
  ProfitLossReportFilters,
} from "@/lib/data/sample-supermarket-reports";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function periodMeta(preset: SalesPeriodPreset, range: SalesDateRange) {
  const period = resolveSalesPeriod(preset, range, todayIso());
  return {
    period,
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
  };
}

function paymentLabel(method: string) {
  switch (method.toUpperCase()) {
    case "MOBILE_MONEY":
      return "Mobile Money";
    case "CARD":
      return "Card";
    case "BANK":
      return "Bank";
    default:
      return "Cash";
  }
}

export async function fetchSalesReportAction(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: SalesReportFilters = {},
): Promise<{ ok: true; data: SalesReportData } | { ok: false; error: string }> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { period, periodLabel, periodDates } = periodMeta(preset, range);
    const fromIso = `${period.start}T00:00:00`;
    const toIso = `${period.end}T23:59:59`;

    const [{ data: salesRows, error: salesError }, { data: returnRows, error: returnError }] =
      await Promise.all([
        supabase
          .from("sm_sales")
          .select(
            "id, invoice_number, sale_date, cashier_id, customer_name, status, subtotal, discount, tax, total, cogs, sm_sale_items(id, product_id, quantity, unit_price, line_total, discount), sm_sale_payments(method, amount)",
          )
          .eq("business_unit_id", businessUnitId)
          .gte("sale_date", fromIso)
          .lte("sale_date", toIso)
          .order("sale_date", { ascending: false }),
        supabase
          .from("sm_sales_returns")
          .select("refund_amount")
          .eq("business_unit_id", businessUnitId)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
      ]);
    if (salesError) mapDbError(salesError);
    if (returnError) mapDbError(returnError);

    const productIds = [
      ...new Set(
        (salesRows ?? []).flatMap((s) =>
          ((s.sm_sale_items ?? []) as { product_id: string }[]).map((i) => i.product_id),
        ),
      ),
    ];
    const cashierIds = [...new Set((salesRows ?? []).map((s) => s.cashier_id).filter(Boolean))];
    const [{ data: products }, { data: profiles }] = await Promise.all([
      productIds.length
        ? supabase.from("sm_products").select("id, name, category_id").in("id", productIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string; category_id: string | null }[] }),
      cashierIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", cashierIds as string[])
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);
    const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
    const cashierName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const categoryFilter = filters.category && filters.category !== "all" ? filters.category : null;
    const cashierFilter = filters.cashier && filters.cashier !== "all" ? filters.cashier : null;
    const paymentFilter = filters.payment && filters.payment !== "all" ? filters.payment : null;

    const paymentMap = new Map<string, { amount: number; count: number }>();
    const cashierMap = new Map<string, { sales: number; itemsSold: number; revenue: number }>();
    const productMap = new Map<string, { quantity: number; revenue: number }>();
    const dailyMap = new Map<string, { amount: number; transactions: number }>();
    let discounts = 0;
    let itemsSold = 0;
    let totalRevenue = 0;
    const sales: SupermarketSale[] = [];

    for (const row of salesRows ?? []) {
      const payments = (row.sm_sale_payments ?? []) as { method: string; amount: number }[];
      const methods = [...new Set(payments.map((p) => paymentLabel(p.method)))];
      const payment = (methods.length > 1 ? "Cash" : methods[0] ?? "Cash") as SupermarketSale["payment"];
      if (paymentFilter && payment !== paymentFilter) continue;

      const cashier = cashierName.get(row.cashier_id) ?? "Cashier";
      if (cashierFilter && cashier !== cashierFilter) continue;

      const lines = ((row.sm_sale_items ?? []) as Record<string, unknown>[]).map((item) => ({
        name: productName.get(String(item.product_id)) ?? "Product",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
      }));

      const amount = Number(row.total) || 0;
      const saleItems = lines.reduce((sum, line) => sum + line.quantity, 0);
      discounts += Number(row.discount) || 0;
      itemsSold += saleItems;
      totalRevenue += amount;

      const pay = paymentMap.get(payment) ?? { amount: 0, count: 0 };
      pay.amount += amount;
      pay.count += 1;
      paymentMap.set(payment, pay);

      const c = cashierMap.get(cashier) ?? { sales: 0, itemsSold: 0, revenue: 0 };
      c.sales += 1;
      c.itemsSold += saleItems;
      c.revenue += amount;
      cashierMap.set(cashier, c);

      const day = formatSalesDate(String(row.sale_date));
      const daily = dailyMap.get(day) ?? { amount: 0, transactions: 0 };
      daily.amount += amount;
      daily.transactions += 1;
      dailyMap.set(day, daily);

      for (const line of lines) {
        if (categoryFilter) continue; // category filter needs category join — skip strict filter when unknown
        const product = productMap.get(line.name) ?? { quantity: 0, revenue: 0 };
        product.quantity += line.quantity;
        product.revenue += line.quantity * line.unitPrice;
        productMap.set(line.name, product);
      }

      sales.push({
        id: row.id,
        soldAt: String(row.sale_date),
        dateLabel: day,
        timeLabel: String(row.sale_date).includes("T") ? String(row.sale_date).slice(11, 16) : "—",
        customer: String(row.customer_name ?? "Walk-in Customer"),
        cashier,
        store: "Main Store",
        payment,
        itemsCount: saleItems,
        amount,
        status: String(row.status).toUpperCase().includes("REFUND") ? "Refunded" : "Completed",
        lines,
        discount: Number(row.discount) || 0,
      });
    }

    const returnsAmount = (returnRows ?? []).reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const ranked = [...productMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.revenue - a.revenue);

    const paymentBreakdown = ["Cash", "Mobile Money", "Card", "Bank"].map((method) => {
      const entry = paymentMap.get(method) ?? { amount: 0, count: 0 };
      return {
        method,
        amount: entry.amount,
        count: entry.count,
        percentage: totalRevenue ? Math.round((entry.amount / totalRevenue) * 1000) / 10 : 0,
      };
    });

    return {
      ok: true,
      data: {
        periodLabel,
        periodDates,
        comparisonLabel: "vs prior period",
        totalRevenue,
        totalSales: sales.length,
        itemsSold,
        discounts,
        returnsAmount,
        returnsCount: returnRows?.length ?? 0,
        deltas: { revenue: 0, sales: 0, itemsSold: 0, returns: 0 },
        paymentBreakdown,
        cashierPerformance: [...cashierMap.entries()].map(([cashier, value]) => ({
          cashier,
          ...value,
        })),
        dailySales: [...dailyMap.entries()].map(([day, value]) => ({
          day,
          amount: value.amount,
          transactions: value.transactions,
        })),
        topProducts: ranked.slice(0, 8),
        lowProducts: ranked.slice(-5).reverse(),
        totalTransactions: sales.length,
        sales,
      },
    };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function fetchInventoryReportAction(
  _preset: SalesPeriodPreset,
  _range: SalesDateRange,
  _filters: InventoryReportFilters = {},
): Promise<{ ok: true; data: InventoryReportData } | { ok: false; error: string }> {
  try {
    const inventory = await loadInventoryValuation();
    if (inventory.error) return { ok: false, error: inventory.error };

    const rows = inventory.products.map((product) => {
      const stock = inventory.batches
        .filter((b) => b.productId === product.id)
        .reduce((sum, b) => sum + b.quantity, 0);
      const value = stock * product.buyingPrice;
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        stock,
        reorderLevel: product.reorderLevel,
        buyingPrice: product.buyingPrice,
        sellingPrice: product.sellingPrice,
        value,
        status: stock <= 0 ? "Out of Stock" : stock <= product.reorderLevel ? "Low Stock" : "In Stock",
      };
    });

    const totalUnits = rows.reduce((s, r) => s + r.stock, 0);
    const stockValue = rows.reduce((s, r) => s + r.value, 0);
    const lowStock = rows.filter((r) => r.status === "Low Stock").length;
    const outOfStock = rows.filter((r) => r.status === "Out of Stock").length;

    const today = todayIso();
    const soonCutoff = new Date();
    soonCutoff.setDate(soonCutoff.getDate() + 30);
    const soonIso = soonCutoff.toISOString().slice(0, 10);

    let expiredUnits = 0;
    let expiringSoonUnits = 0;
    let expiredStockValue = 0;
    for (const batch of inventory.batches) {
      if (!batch.expiryDate || batch.quantity <= 0) continue;
      if (batch.expiryDate < today) {
        expiredUnits += batch.quantity;
        expiredStockValue += batch.quantity * batch.buyingPrice;
      } else if (batch.expiryDate <= soonIso) {
        expiringSoonUnits += batch.quantity;
      }
    }

    const expiryRows = inventory.batches
      .filter((batch) => batch.quantity > 0 && batch.expiryDate)
      .map((batch) => {
        const status =
          (batch.expiryDate as string) < today
            ? ("Expired" as const)
            : (batch.expiryDate as string) <= soonIso
              ? ("Expiring Soon" as const)
              : null;
        if (!status) return null;
        return {
          name: inventory.products.find((p) => p.id === batch.productId)?.name ?? "Product",
          quantity: batch.quantity,
          expiryDate: batch.expiryDate as string,
          status,
          stockValue: batch.quantity * batch.buyingPrice,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const data: InventoryReportData = {
      periodLabel: "Current stock",
      periodDates: formatSalesDate(today),
      comparisonLabel: "",
      totalProducts: rows.length,
      totalStockUnits: totalUnits,
      totalInventoryValue: stockValue,
      inStock: rows.filter((r) => r.status === "In Stock").length,
      lowStock,
      outOfStock,
      expiringSoon: expiringSoonUnits,
      expiredItems: expiredUnits,
      expiredStockValue,
      deltas: { products: 0, stockUnits: 0, inventoryValue: 0, lowStock: 0 },
      movements: [],
      lowStockProducts: rows
        .filter((r) => r.status === "Low Stock")
        .slice(0, 20)
        .map((r) => ({
          name: r.name,
          sku: r.sku,
          stock: r.stock,
          reorderLevel: r.reorderLevel,
          value: r.value,
          status: r.status,
        })),
      valuation: rows.map((r) => ({
        name: r.name,
        quantity: r.stock,
        buyingPrice: r.buyingPrice,
        stockValue: r.value,
        status: r.status,
        category: r.category,
      })),
      expiryRows,
    };

    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function fetchPurchaseReportAction(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  _filters: PurchaseReportFilters = {},
): Promise<{ ok: true; data: PurchaseReportData } | { ok: false; error: string }> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { period, periodLabel, periodDates } = periodMeta(preset, range);
    const fromIso = `${period.start}T00:00:00`;
    const toIso = `${period.end}T23:59:59`;

    const [{ data: receipts, error }, { data: orders }] = await Promise.all([
      supabase
        .from("sm_goods_receipts")
        .select(
          "id, receipt_number, supplier_id, received_at, payment_status, total_cost, purchase_order_id, sm_goods_receipt_items(id, product_id, quantity, unit_cost)",
        )
        .eq("business_unit_id", businessUnitId)
        .gte("received_at", fromIso)
        .lte("received_at", toIso),
      supabase
        .from("sm_purchase_orders")
        .select("id, po_number, status, total, supplier_id")
        .eq("business_unit_id", businessUnitId),
    ]);
    if (error) mapDbError(error);

    const supplierIds = [
      ...new Set((receipts ?? []).map((r) => r.supplier_id).filter(Boolean)),
    ];
    const { data: suppliers } = supplierIds.length
      ? await supabase.from("sm_suppliers").select("id, name").in("id", supplierIds as string[])
      : { data: [] as { id: string; name: string }[] };
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

    const totalPurchases = (receipts ?? []).reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const supplierMap = new Map<string, { amount: number; receipts: number }>();
    for (const receipt of receipts ?? []) {
      const name = supplierName.get(receipt.supplier_id) ?? "Supplier";
      const entry = supplierMap.get(name) ?? { amount: 0, receipts: 0 };
      entry.amount += Number(receipt.total_cost) || 0;
      entry.receipts += 1;
      supplierMap.set(name, entry);
    }

    const outstanding = (orders ?? []).filter((o) =>
      ["SENT", "PARTIALLY_RECEIVED", "DRAFT"].includes(String(o.status)),
    );

    const itemsPurchased = (receipts ?? []).reduce((sum, receipt) => {
      const items = (receipt.sm_goods_receipt_items ?? []) as { quantity?: number }[];
      return sum + items.reduce((lineSum, item) => lineSum + (Number(item.quantity) || 0), 0);
    }, 0);
    const amountPaid = (receipts ?? [])
      .filter((r) => String(r.payment_status).toUpperCase() === "PAID")
      .reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const outstandingAmount = Math.max(0, totalPurchases - amountPaid);
    const purchaseCount = receipts?.length ?? 0;

    const paymentStatusSummaryMap = new Map<string, { amount: number; count: number }>();
    for (const receipt of receipts ?? []) {
      const status = String(receipt.payment_status || "UNPAID");
      const entry = paymentStatusSummaryMap.get(status) ?? { amount: 0, count: 0 };
      entry.amount += Number(receipt.total_cost) || 0;
      entry.count += 1;
      paymentStatusSummaryMap.set(status, entry);
    }

    const data: PurchaseReportData = {
      periodLabel,
      periodDates,
      comparisonLabel: "vs prior period",
      totalPurchases,
      purchaseCount,
      itemsPurchased,
      supplierCount: supplierMap.size,
      amountPaid,
      outstanding: outstandingAmount,
      averageOrderValue: purchaseCount ? Math.round(totalPurchases / purchaseCount) : 0,
      deltas: { purchases: 0, orders: 0, items: 0, outstanding: 0 },
      purchases: (receipts ?? []).map((r) => {
        const items = (r.sm_goods_receipt_items ?? []) as { quantity?: number }[];
        return {
          number: r.receipt_number,
          supplier: supplierName.get(r.supplier_id) ?? "Supplier",
          date: String(r.received_at).slice(0, 10),
          items: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
          amount: Number(r.total_cost) || 0,
          paymentStatus: String(r.payment_status),
          status: "Received",
        };
      }),
      suppliers: [...supplierMap.entries()].map(([name, value]) => ({
        name,
        purchases: value.amount,
        paid: value.amount,
        outstanding: 0,
      })),
      paymentStatusSummary: [...paymentStatusSummaryMap.entries()].map(([status, value]) => ({
        status,
        amount: value.amount,
        count: value.count,
        percentage: totalPurchases ? Math.round((value.amount / totalPurchases) * 1000) / 10 : 0,
      })),
    };

    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function fetchProfitLossReportAction(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  _filters: ProfitLossReportFilters = {},
): Promise<{ ok: true; data: ProfitLossReportData } | { ok: false; error: string }> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { period, periodLabel, periodDates } = periodMeta(preset, range);
    const fromIso = `${period.start}T00:00:00`;
    const toIso = `${period.end}T23:59:59`;

    const [salesRes, expensesRes, returnsRes, itemsRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("total, cogs, discount")
        .eq("business_unit_id", businessUnitId)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso),
      supabase
        .from("sm_expenses")
        .select("amount, category, expense_date, description")
        .eq("business_unit_id", businessUnitId)
        .gte("expense_date", period.start)
        .lte("expense_date", period.end),
      supabase
        .from("sm_sales_returns")
        .select("refund_amount")
        .eq("business_unit_id", businessUnitId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("sm_sale_items")
        .select("product_id, quantity, unit_price, buying_cost_snapshot, line_total, sm_sales!inner(sale_date, business_unit_id)")
        .eq("sm_sales.business_unit_id", businessUnitId)
        .gte("sm_sales.sale_date", fromIso)
        .lte("sm_sales.sale_date", toIso),
    ]);
    if (salesRes.error) mapDbError(salesRes.error);

    const revenue = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
    const costOfGoodsSold = (salesRes.data ?? []).reduce((s, r) => s + Number(r.cogs || 0), 0);
    const refunds = (returnsRes.data ?? []).reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const grossProfit = revenue - costOfGoodsSold - refunds;
    const operatingExpenses = (expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const netProfit = grossProfit - operatingExpenses;
    const salesCount = salesRes.data?.length ?? 0;

    const productProfitMap = new Map<string, { unitsSold: number; productProfit: number }>();
    const productIds = [...new Set((itemsRes.data ?? []).map((i) => i.product_id))];
    const { data: products } = productIds.length
      ? await supabase.from("sm_products").select("id, name").in("id", productIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map((products ?? []).map((p) => [p.id, p.name]));

    for (const item of itemsRes.data ?? []) {
      const name = names.get(item.product_id) ?? "Product";
      const qty = Number(item.quantity) || 0;
      const profit =
        (Number(item.unit_price) - Number(item.buying_cost_snapshot || 0)) * qty;
      const entry = productProfitMap.get(name) ?? { unitsSold: 0, productProfit: 0 };
      entry.unitsSold += qty;
      entry.productProfit += profit;
      productProfitMap.set(name, entry);
    }

    const expenses = (expensesRes.data ?? []).map((row) => {
      const mapped = mapExpense(row as Record<string, unknown>);
      return {
        category: mapped.category,
        description: mapped.description || mapped.category,
        amount: mapped.amount,
      };
    });

    const expenseByCategory = new Map<string, number>();
    for (const expense of expenses) {
      expenseByCategory.set(
        expense.category,
        (expenseByCategory.get(expense.category) ?? 0) + expense.amount,
      );
    }

    const data: ProfitLossReportData = {
      periodLabel,
      periodDates,
      comparisonLabel: "vs prior period",
      revenue,
      costOfGoodsSold,
      grossProfit,
      operatingExpenses,
      otherIncome: 0,
      inventoryLoss: 0,
      netProfit,
      grossMargin: revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
      netMargin: revenue ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
      operatingExpenseRatio: revenue
        ? Math.round((operatingExpenses / revenue) * 1000) / 10
        : 0,
      inventoryTurnover: 0,
      averageOrderValue: salesCount ? Math.round(revenue / salesCount) : 0,
      breakEvenSales: 0,
      deltas: { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0 },
      productProfit: grossProfit,
      topProducts: [...productProfitMap.entries()]
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.productProfit - a.productProfit)
        .slice(0, 8),
      expenses,
      topOperatingExpenses: [...expenseByCategory.entries()]
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: operatingExpenses
            ? Math.round((amount / operatingExpenses) * 1000) / 10
            : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };

    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function listReturnsAction() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_sales_returns")
      .select("*, sm_sales_return_items(*), sm_sales(invoice_number, customer_name)")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) mapDbError(error);

    const productIds = [
      ...new Set(
        (data ?? []).flatMap((row) =>
          ((row.sm_sales_return_items ?? []) as { product_id: string }[]).map((i) => i.product_id),
        ),
      ),
    ];
    const { data: products } = productIds.length
      ? await supabase.from("sm_products").select("id, name").in("id", productIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map((products ?? []).map((p) => [p.id, p.name]));

    const returns = (data ?? []).map((row) => {
      const sale = row.sm_sales as { invoice_number?: string; customer_name?: string } | null;
      const items = ((row.sm_sales_return_items ?? []) as Record<string, unknown>[]).map((item) => ({
        ...item,
        product_name: names.get(String(item.product_id)) ?? "Product",
      }));
      return { ...row, sm_sales_return_items: items, invoice_number: sale?.invoice_number ?? "" };
    });

    return { ok: true as const, returns };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getFinanceSummaryAction(input: { from: string; to: string }) {
  try {
    const report = await (async () => {
      const { supabase, businessUnitId } = await requireSupermarketContext();
      const fromIso = `${input.from}T00:00:00`;
      const toIso = `${input.to}T23:59:59`;
      const [salesRes, expensesRes, paymentsRes, receiptsRes] = await Promise.all([
        supabase
          .from("sm_sales")
          .select("total, cogs")
          .eq("business_unit_id", businessUnitId)
          .gte("sale_date", fromIso)
          .lte("sale_date", toIso),
        supabase
          .from("sm_expenses")
          .select("amount")
          .eq("business_unit_id", businessUnitId)
          .gte("expense_date", input.from)
          .lte("expense_date", input.to),
        supabase
          .from("sm_payments")
          .select("direction, method, amount, kind")
          .eq("business_unit_id", businessUnitId)
          .gte("payment_date", input.from)
          .lte("payment_date", input.to),
        supabase
          .from("sm_goods_receipts")
          .select("total_cost, payment_status, received_at")
          .eq("business_unit_id", businessUnitId)
          .gte("received_at", fromIso)
          .lte("received_at", toIso),
      ]);
      if (salesRes.error) mapDbError(salesRes.error);
      if (expensesRes.error) mapDbError(expensesRes.error);
      if (paymentsRes.error) mapDbError(paymentsRes.error);
      if (receiptsRes.error) mapDbError(receiptsRes.error);

      const revenue = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const cogs = (salesRes.data ?? []).reduce((s, r) => s + Number(r.cogs || 0), 0);
      const productProfit = revenue - cogs;
      const expenses = (expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
      const netProfit = productProfit - expenses;

      const cashBalance = { cash: 0, mobileMoney: 0, card: 0, bank: 0 };
      for (const payment of paymentsRes.data ?? []) {
        const amount = Number(payment.amount) || 0;
        const signed = payment.direction === "OUT" ? -amount : amount;
        const method = String(payment.method).toUpperCase();
        if (method === "MOBILE_MONEY") cashBalance.mobileMoney += signed;
        else if (method === "CARD") cashBalance.card += signed;
        else if (method === "BANK") cashBalance.bank += signed;
        else cashBalance.cash += signed;
      }

      const totalPurchases = (receiptsRes.data ?? []).reduce(
        (s, r) => s + Number(r.total_cost || 0),
        0,
      );
      const totalPaid = (receiptsRes.data ?? [])
        .filter((r) => String(r.payment_status).toUpperCase() === "PAID")
        .reduce((s, r) => s + Number(r.total_cost || 0), 0);

      return {
        revenue,
        productProfit,
        expenses,
        netProfit,
        cashBalance,
        supplierOutstanding: {
          totalPurchases,
          totalPaid,
          outstanding: Math.max(0, totalPurchases - totalPaid),
        },
        deltas: { revenue: 0, productProfit: 0, expenses: 0, netProfit: 0 },
        periodLabel: `${input.from} – ${input.to}`,
      };
    })();
    return { ok: true as const, summary: report };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getProductProfitRowsAction(input?: { from?: string; to?: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const from = input?.from ?? "1970-01-01";
    const to = input?.to ?? new Date().toISOString().slice(0, 10);
    const fromIso = `${from}T00:00:00`;
    const toIso = `${to}T23:59:59`;

    const { data, error } = await supabase
      .from("sm_sale_items")
      .select(
        "product_id, quantity, unit_price, buying_cost_snapshot, line_total, sm_sales!inner(sale_date, business_unit_id)",
      )
      .eq("sm_sales.business_unit_id", businessUnitId)
      .gte("sm_sales.sale_date", fromIso)
      .lte("sm_sales.sale_date", toIso);
    if (error) mapDbError(error);

    const byProduct = new Map<
      string,
      { quantitySold: number; revenue: number; buyingCost: number; unitPriceSum: number; buyPriceSum: number }
    >();
    for (const item of data ?? []) {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const buy = Number(item.buying_cost_snapshot) || 0;
      const lineTotal = Number(item.line_total) || unitPrice * qty;
      const entry = byProduct.get(item.product_id) ?? {
        quantitySold: 0,
        revenue: 0,
        buyingCost: 0,
        unitPriceSum: 0,
        buyPriceSum: 0,
      };
      entry.quantitySold += qty;
      entry.revenue += lineTotal;
      entry.buyingCost += buy * qty;
      entry.unitPriceSum += unitPrice * qty;
      entry.buyPriceSum += buy * qty;
      byProduct.set(item.product_id, entry);
    }

    const productIds = [...byProduct.keys()];
    const { data: products } = productIds.length
      ? await supabase.from("sm_products").select("id, name").in("id", productIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map((products ?? []).map((p) => [p.id, p.name]));

    const rows = productIds.map((id) => {
      const entry = byProduct.get(id)!;
      const sellingPrice =
        entry.quantitySold > 0 ? entry.unitPriceSum / entry.quantitySold : 0;
      const buyingPrice = entry.quantitySold > 0 ? entry.buyPriceSum / entry.quantitySold : 0;
      const productProfit = entry.revenue - entry.buyingCost;
      return {
        product: names.get(id) ?? "Product",
        unitsSold: entry.quantitySold,
        sellingPrice,
        buyingPrice,
        revenue: entry.revenue,
        buyingCost: entry.buyingCost,
        productProfit,
        marginPercent: entry.revenue === 0 ? 0 : (productProfit / entry.revenue) * 100,
      };
    });

    return { ok: true as const, rows };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
