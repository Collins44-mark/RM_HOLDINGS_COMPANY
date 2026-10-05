import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { FinanceCategoryRow } from "@/lib/data/finance";

export function FinanceCategoryTable({ rows }: { rows: FinanceCategoryRow[] }) {
  const hasActivity = rows.some((row) => row.amount !== 0);

  return (
    <section className="overflow-hidden rounded-card border border-[color:var(--color-line)] bg-white shadow-card">
      <div className="px-5 py-5">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">Category Breakdown</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Composition of Group financial activity from live supermarket sales, COGS, and expense
          categories.
        </p>
      </div>
      {!hasActivity ? (
        <p className="px-5 pb-6 text-[13.5px] text-slate-500">
          Category breakdown is not available for the selected period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-[#f4f6fa]">
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">Category</th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">Type</th>
                <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                  Amount (TZS)
                </th>
                <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.type}-${row.category}`}
                  className="border-b border-[color:var(--color-line)] last:border-0 hover:bg-[#f8fafc]/80"
                >
                  <td className="px-5 py-4 text-[14px] font-semibold text-navy">{row.category}</td>
                  <td className="px-5 py-4 text-[13.5px] text-slate-500">{row.type}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                    {formatTzs(row.amount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] text-navy">
                    {formatPercent(row.share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
