import { BarChart3 } from "lucide-react";
import { BusinessUnitFinanceRow } from "@/components/finance/BusinessUnitFinanceRow";
import { MarginBadge } from "@/components/finance/MarginBadge";
import { formatTzs } from "@/lib/format/currency";
import type { UnitFinanceRow } from "@/lib/data/finance";

export function BusinessUnitFinanceTable({
  rows,
  totals,
}: {
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[960px] w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="bg-[#f4f6fa]">
            <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">#</th>
            <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">Business Unit</th>
            <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
              Revenue (TZS)
            </th>
            <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
              Expenses (TZS)
            </th>
            <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
              Operating Position (TZS)
            </th>
            <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">Margin (%)</th>
            <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <BusinessUnitFinanceRow key={row.code} index={index + 1} row={row} />
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#eef4fc]">
            <td className="px-5 py-4" colSpan={2}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#dce8fb] text-[#2f62c4]">
                  <BarChart3 className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="text-[14px] font-bold text-navy">
                  Total (All Business Units)
                </span>
              </div>
            </td>
            <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-bold text-navy">
              {formatTzs(totals.revenue)}
            </td>
            <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-bold text-navy">
              {formatTzs(totals.expenses)}
            </td>
            <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-bold text-navy">
              {formatTzs(totals.operatingPosition)}
            </td>
            <td className="px-5 py-4">
              <MarginBadge value={totals.margin} emphasis="total" />
            </td>
            <td className="px-5 py-4" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
