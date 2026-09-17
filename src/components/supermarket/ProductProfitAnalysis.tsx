"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  filterProductProfitRows,
  getProductProfitRows,
  productProfitTotals,
  type ProductProfitSort,
} from "@/lib/data/sample-supermarket-finance";
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
  const allRows = useMemo(() => getProductProfitRows(), []);

  const rows = useMemo(
    () => filterProductProfitRows(allRows, { sort, query }),
    [allRows, sort, query],
  );
  const totals = useMemo(() => productProfitTotals(rows), [rows]);

  return (
    <div className="min-w-0 space-y-5 pb-10 sm:space-y-6">
      <div>
        <Link
          href="/supermarket/finance"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Finance
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
          Product Profit
        </h1>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          See which products generated profit from selling price minus buying price.
        </p>
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
              placeholder="Search product..."
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
                <th className="px-5 py-3 font-medium">Revenue</th>
                <th className="px-5 py-3 font-medium">Buying Cost</th>
                <th className="px-5 py-3 font-medium">Product Profit</th>
                <th className="px-5 py-3 font-medium">Profit Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product} className="border-t border-white/50">
                  <td className="px-5 py-3.5 text-[13.5px] font-semibold text-navy">{row.product}</td>
                  <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                    {row.unitsSold.toLocaleString("en-US")}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] font-medium tabular-nums text-navy">
                    {formatTzs(row.revenue)}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                    {formatTzs(row.buyingCost)}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] font-semibold tabular-nums text-emerald-700">
                    {formatTzs(row.productProfit)}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                    {row.marginPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    No products found for this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => (
            <article
              key={row.product}
              className="rounded-[18px] border border-white/70 bg-white/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <p className="text-[14px] font-semibold text-navy">{row.product}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                <div>
                  <dt className="text-slate-400">Units Sold</dt>
                  <dd className="mt-0.5 font-medium text-navy">{row.unitsSold.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Margin</dt>
                  <dd className="mt-0.5 font-medium text-navy">{row.marginPercent.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Revenue</dt>
                  <dd className="mt-0.5 font-medium text-navy">{formatTzs(row.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Buying Cost</dt>
                  <dd className="mt-0.5 font-medium text-slate-600">{formatTzs(row.buyingCost)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Product Profit</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold text-emerald-700">
                    {formatTzs(row.productProfit)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-slate-500">No products found for this search.</p>
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
