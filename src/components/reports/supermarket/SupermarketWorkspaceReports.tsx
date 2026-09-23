"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  fetchInventoryReportAction,
  fetchProfitLossReportAction,
  fetchPurchaseReportAction,
  fetchSalesReportAction,
} from "@/actions/supermarket/reports";
import {
  ReportEmptyState,
  ReportMetricCard,
  ReportResultHeader,
  ReportSurface,
} from "@/components/reports/report-ui";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { ReportPeriod } from "@/lib/data/report-period";
import { reportPeriodToSalesInput } from "@/lib/reports/period-bridge";
import { useLiveReport } from "@/lib/supermarket/use-live-report";
import {
  downloadInventoryReportPdfFromData,
  downloadProfitLossReportPdfFromData,
  downloadPurchaseReportPdfFromData,
  downloadSalesReportPdfFromData,
} from "@/lib/data/supermarket-reports-pdf";
import type { SalesReportFilters } from "@/lib/data/sample-supermarket-reports";

const EMPTY_FILTERS = {} as const;

function LoadingBlock() {
  return (
    <ReportSurface className="px-6 py-14 text-center text-[13.5px] text-slate-500">
      Loading report…
    </ReportSurface>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <ReportEmptyState
      title="Report could not be loaded"
      description={message}
    />
  );
}

function useSalesPeriod(period: ReportPeriod, from?: string, to?: string) {
  return useMemo(
    () => reportPeriodToSalesInput(period, { from, to }),
    [period, from, to],
  );
}

export function SupermarketSalesWorkspaceReport({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const salesPeriod = useSalesPeriod(period, from, to);
  const [payment, setPayment] = useState("all");
  const filters = useMemo<SalesReportFilters>(
    () => ({ payment, cashier: "all", category: "all" }),
    [payment],
  );
  const { data, error, loading } = useLiveReport(
    fetchSalesReportAction,
    salesPeriod.preset,
    salesPeriod.range,
    filters,
  );

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) {
    return (
      <ReportEmptyState
        title="No sales data"
        description="There are no sales for the selected period."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <ReportResultHeader
          moduleLabel="Supermarket"
          title="Sales Report"
          description="Sales transactions, revenue and payment summary for the selected period."
        />
        <button
          type="button"
          onClick={() => downloadSalesReportPdfFromData(data, filters)}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] border border-white/80 bg-white/85 px-4 text-[13px] font-semibold text-navy shadow-[0_4px_14px_rgba(15,35,64,0.05)]"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Download PDF
        </button>
      </div>

      <ReportSurface className="px-4 py-4 sm:px-5">
        <label className="block max-w-xs">
          <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment Method</span>
          <select
            value={payment}
            onChange={(event) => setPayment(event.target.value)}
            className="h-11 w-full rounded-[12px] border border-white/80 bg-white/90 px-3 text-[13px] text-navy outline-none"
          >
            <option value="all">All methods</option>
            <option value="Cash">Cash</option>
            <option value="Mobile Money">Mobile Money</option>
            <option value="Card">Card</option>
            <option value="Bank">Bank</option>
          </select>
        </label>
      </ReportSurface>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard label="Total Sales" value={formatTzs(data.totalRevenue)} />
        <ReportMetricCard label="Transactions" value={String(data.totalSales)} />
        <ReportMetricCard label="Items Sold" value={String(data.itemsSold)} />
        <ReportMetricCard label="Discounts" value={formatTzs(data.discounts)} />
      </div>

      <ReportSurface className="overflow-x-auto">
        <div className="border-b border-black/[0.04] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-navy">Sales Transactions</h3>
          <p className="mt-1 text-[12.5px] text-slate-500">{data.periodDates}</p>
        </div>
        <table className="min-w-[900px] w-full text-left">
          <thead>
            <tr className="border-b border-black/[0.04] text-[12px] text-slate-400">
              <th className="px-5 py-3 font-medium">Date & Time</th>
              <th className="px-5 py-3 font-medium">Receipt</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Items</th>
              <th className="px-5 py-3 font-medium">Discount</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Payment</th>
              <th className="px-5 py-3 font-medium">Cashier</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.sales.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                  No sales in this period.
                </td>
              </tr>
            ) : (
              data.sales.map((sale) => (
                <tr key={sale.id} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-5 py-3.5 text-[13px] text-navy">
                    {sale.dateLabel}
                    <span className="mt-0.5 block text-[12px] text-slate-400">{sale.timeLabel}</span>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] font-medium text-navy">{sale.id}</td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{sale.customer}</td>
                  <td className="px-5 py-3.5 text-[13px] tabular-nums text-navy">{sale.itemsCount}</td>
                  <td className="px-5 py-3.5 text-[13px] tabular-nums text-navy">
                    {formatTzs(sale.discount)}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] font-semibold tabular-nums text-navy">
                    {formatTzs(sale.amount)}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{sale.payment}</td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{sale.cashier}</td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{sale.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSurface>
    </div>
  );
}

export function SupermarketPurchasesWorkspaceReport({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const salesPeriod = useSalesPeriod(period, from, to);
  const { data, error, loading } = useLiveReport(
    fetchPurchaseReportAction,
    salesPeriod.preset,
    salesPeriod.range,
    EMPTY_FILTERS,
  );

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) {
    return (
      <ReportEmptyState
        title="No purchases data"
        description="There are no purchases for the selected period."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <ReportResultHeader
          moduleLabel="Supermarket"
          title="Purchases Report"
          description="Goods receipts and purchasing activity for the selected period."
        />
        <button
          type="button"
          onClick={() => downloadPurchaseReportPdfFromData(data)}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] border border-white/80 bg-white/85 px-4 text-[13px] font-semibold text-navy"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Download PDF
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard label="Total Purchases" value={formatTzs(data.totalPurchases)} />
        <ReportMetricCard label="Receipts" value={String(data.purchaseCount)} />
        <ReportMetricCard label="Suppliers" value={String(data.supplierCount)} />
        <ReportMetricCard label="Items Received" value={String(data.itemsPurchased)} />
      </div>
      <ReportSurface className="overflow-x-auto">
        <div className="border-b border-black/[0.04] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-navy">Purchase Activity</h3>
          <p className="mt-1 text-[12.5px] text-slate-500">{data.periodDates}</p>
        </div>
        <table className="min-w-[720px] w-full text-left">
          <thead>
            <tr className="border-b border-black/[0.04] text-[12px] text-slate-400">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Reference</th>
              <th className="px-5 py-3 font-medium">Supplier</th>
              <th className="px-5 py-3 font-medium">Items</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.purchases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                  No purchases in this period.
                </td>
              </tr>
            ) : (
              data.purchases.map((row) => (
                <tr key={row.number} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-5 py-3.5 text-[13px] text-navy">{row.date}</td>
                  <td className="px-5 py-3.5 text-[13px] font-medium text-navy">{row.number}</td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{row.supplier}</td>
                  <td className="px-5 py-3.5 text-[13px] tabular-nums text-navy">{row.items}</td>
                  <td className="px-5 py-3.5 text-[13px] font-semibold tabular-nums text-navy">
                    {formatTzs(row.amount)}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{row.paymentStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSurface>
    </div>
  );
}

export function SupermarketInventoryWorkspaceReport({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const salesPeriod = useSalesPeriod(period, from, to);
  const { data, error, loading } = useLiveReport(
    fetchInventoryReportAction,
    salesPeriod.preset,
    salesPeriod.range,
    EMPTY_FILTERS,
  );

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) {
    return (
      <ReportEmptyState
        title="No inventory data"
        description="Inventory valuation is not available for the selected period."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <ReportResultHeader
          moduleLabel="Supermarket"
          title="Inventory Report"
          description="Stock valuation and inventory position for the selected period."
        />
        <button
          type="button"
          onClick={() => downloadInventoryReportPdfFromData(data)}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] border border-white/80 bg-white/85 px-4 text-[13px] font-semibold text-navy"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Download PDF
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard label="Inventory Value" value={formatTzs(data.totalInventoryValue)} />
        <ReportMetricCard label="Products" value={String(data.totalProducts)} />
        <ReportMetricCard label="Units on Hand" value={String(data.totalStockUnits)} />
        <ReportMetricCard label="Low Stock" value={String(data.lowStock)} />
      </div>
      <ReportSurface className="overflow-x-auto">
        <div className="border-b border-black/[0.04] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-navy">Stock Position</h3>
          <p className="mt-1 text-[12.5px] text-slate-500">{data.periodDates}</p>
        </div>
        <table className="min-w-[720px] w-full text-left">
          <thead>
            <tr className="border-b border-black/[0.04] text-[12px] text-slate-400">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Qty</th>
              <th className="px-5 py-3 font-medium">Value</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.valuation.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                  No inventory rows.
                </td>
              </tr>
            ) : (
              data.valuation.map((row, index) => (
                <tr key={`${row.name}-${index}`} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-5 py-3.5 text-[13px] font-medium text-navy">{row.name}</td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{row.category}</td>
                  <td className="px-5 py-3.5 text-[13px] tabular-nums text-navy">{row.quantity}</td>
                  <td className="px-5 py-3.5 text-[13px] font-semibold tabular-nums text-navy">
                    {formatTzs(row.stockValue)}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-navy">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSurface>
    </div>
  );
}

export function SupermarketProfitLossWorkspaceReport({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const salesPeriod = useSalesPeriod(period, from, to);
  const { data, error, loading } = useLiveReport(
    fetchProfitLossReportAction,
    salesPeriod.preset,
    salesPeriod.range,
    EMPTY_FILTERS,
  );

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) {
    return (
      <ReportEmptyState
        title="No P&L data"
        description="Profit and loss is not available for the selected period."
      />
    );
  }

  const rows: [string, string][] = [
    ["Revenue", formatTzs(data.revenue)],
    ["COGS", formatTzs(data.costOfGoodsSold)],
    ["Gross Profit", formatTzs(data.grossProfit)],
    ["Operating Expenses", formatTzs(data.operatingExpenses)],
    ["Net Profit", formatTzs(data.netProfit)],
    ["Gross Margin", formatPercent(data.grossMargin)],
    ["Net Margin", formatPercent(data.netMargin)],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <ReportResultHeader
          moduleLabel="Supermarket"
          title="Profit & Loss Report"
          description="Revenue, COGS, expenses and net result for the selected period."
        />
        <button
          type="button"
          onClick={() => downloadProfitLossReportPdfFromData(data)}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] border border-white/80 bg-white/85 px-4 text-[13px] font-semibold text-navy"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Download PDF
        </button>
      </div>
      <ReportSurface className="px-5 py-5">
        <p className="mb-3 text-[12.5px] text-slate-500">{data.periodDates}</p>
        <div className="max-w-xl">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b border-black/[0.04] py-3 last:border-0"
            >
              <span className="text-[13.5px] text-slate-600">{label}</span>
              <span className="text-[13.5px] font-semibold tabular-nums text-navy">{value}</span>
            </div>
          ))}
        </div>
      </ReportSurface>
    </div>
  );
}
