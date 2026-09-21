"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  filterProductProfitRows,
  productProfitTotals,
  type ProductProfitRow,
  type ProductProfitSort,
} from "@/lib/data/sample-supermarket-finance";
import { getProductProfitRowsAction } from "@/actions/supermarket/reports";
import { FinanceBackLink } from "@/components/supermarket/FinanceBackLink";
import { filterClass, tableHead } from "@/components/supermarket/purchasing-ui";

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

const SORT_OPTIONS: { id: ProductProfitSort; label: string }[] = [
  { id: "all", label: "All Products" },
  { id: "highest", label: "Highest Profit" },
  { id: "lowest", label: "Lowest Profit" },
];

export function ProductProfitAnalysis() {
  const [sort, setSort] = useState<ProductProfitSort>("all");
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState<ProductProfitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getProductProfitRowsAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setAllRows([]);
      } else {
        setError(null);
        setAllRows(result.rows);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () => filterProductProfitRows(allRows, { sort, query }),
    [allRows, sort, query],
  );
  const totals = useMemo(() => productProfitTotals(rows), [rows]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <div>
        <FinanceBackLink />
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
          Product Profit
        </h1>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          See which products generated profit from selling price minus buying price.
        </p>
        {error ? <p className="mt-2 text-[12.5px] text-[#c45b66]">{error}</p> : null}
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat label="Total Product Profit" value={formatTzs(totals.totalProductProfit)} />
        <SummaryStat label="Total Units Sold" value={totals.totalUnitsSold.toLocaleString("en-US")} />
        <SummaryStat label="Average Profit Margin" value={`${totals.averageMargin.toFixed(1)}%`} />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5 sm:py-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((option) => {
              const active = sort === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSort(option.id)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3.5 text-[12.5px] font-semibold transition",
                    active
                      ? "border-navy/15 bg-[#0b2244] text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)]"
                      : "border-white/70 bg-white/70 text-navy hover:bg-white",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <label className="relative block w-full lg:max-w-xs">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products..."
              className={cn(filterClass, "pl-10")}
            />
          </label>
        </div>
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Units Sold</th>
                <th className="px-5 py-3 font-medium">Selling Price</th>
                <th className="px-5 py-3 font-medium">Buying Price</th>
                <th className="px-5 py-3 font-medium">Revenue</th>
                <th className="px-5 py-3 font-medium">Buying Cost</th>
                <th className="px-5 py-3 font-medium">Product Profit</th>
                <th className="px-5 py-3 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    Loading product profit…
                  </td>
                </tr>
              ) : null}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.product} className="border-t border-white/50">
                    <td className="px-5 py-3.5 text-[13.5px] font-semibold text-navy">{row.product}</td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {row.unitsSold.toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {formatTzs(row.sellingPrice)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {formatTzs(row.buyingPrice)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {formatTzs(row.revenue)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {formatTzs(row.buyingCost)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] font-semibold tabular-nums text-navy">
                      {formatTzs(row.productProfit)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {row.marginPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    No sold products in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {loading ? (
            <p className="py-8 text-center text-[13.5px] text-slate-500">Loading product profit…</p>
          ) : null}
          {!loading &&
            rows.map((row) => (
              <article
                key={row.product}
                className="rounded-[18px] border border-white/70 bg-white/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <p className="text-[14px] font-semibold text-navy">{row.product}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div>
                    <dt className="text-slate-400">Units</dt>
                    <dd className="mt-0.5 font-medium text-navy">{row.unitsSold}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Profit</dt>
                    <dd className="mt-0.5 font-medium text-navy">{formatTzs(row.productProfit)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Revenue</dt>
                    <dd className="mt-0.5 font-medium text-navy">{formatTzs(row.revenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Margin</dt>
                    <dd className="mt-0.5 font-medium text-navy">{row.marginPercent.toFixed(1)}%</dd>
                  </div>
                </dl>
              </article>
            ))}
          {!loading && rows.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-slate-500">No sold products in this period.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(glass, "px-4 py-4 sm:px-5")}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </div>
  );
}
