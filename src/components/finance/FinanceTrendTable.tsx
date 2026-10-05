import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { FinanceTrendRow } from "@/lib/data/finance";

export function FinanceTrendTable({
  rows,
  grain,
}: {
  rows: FinanceTrendRow[];
  grain: "month" | "day";
}) {
  return (
    <section className="overflow-hidden rounded-card border border-[color:var(--color-line)] bg-white shadow-card">
      <div className="px-5 py-5">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">Trend Analysis</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          {grain === "month"
            ? "Monthly operating position for the selected period, using the same Group Finance formula."
            : "Daily operating position for the selected period, using the same Group Finance formula."}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[880px] w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[#f4f6fa]">
              <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">Period</th>
              <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                Revenue (TZS)
              </th>
              <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                COGS (TZS)
              </th>
              <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                Expenses (TZS)
              </th>
              <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                Operating Position (TZS)
              </th>
              <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.period}
                className="border-b border-[color:var(--color-line)] last:border-0 hover:bg-[#f8fafc]/80"
              >
                <td className="whitespace-nowrap px-5 py-4 text-[14px] font-semibold text-navy">
                  {row.period}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                  {formatTzs(row.revenue)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                  {formatTzs(row.cogs)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                  {formatTzs(row.expenses)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-semibold text-navy">
                  {formatTzs(row.operatingPosition)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                  {formatPercent(row.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
