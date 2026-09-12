import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { UnitFinanceRow } from "@/lib/data/finance";

export function BusinessPerformanceSection({ rows }: { rows: UnitFinanceRow[] }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">Business Performance</h2>
        <p className="mt-1 text-[13.5px] leading-5 text-slate-500">
          Revenue, expenses and operating position across all business units.
        </p>
      </div>
      <div className="overflow-hidden rounded-[20px] border border-white/90 bg-white/92 shadow-[0_8px_28px_rgba(20,40,70,0.045)]">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">
                  Business Unit
                </th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">
                  Revenue
                </th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">
                  Expenses
                </th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">
                  Operating Position
                </th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">Margin</th>
                <th className="px-5 py-3.5 text-[12.5px] font-medium text-slate-400">Status</th>
                <th className="px-5 py-3.5 text-right text-[12.5px] font-medium text-slate-400">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
                  {rows.map((row) => (
                <tr key={row.code}>
                  <td className="border-t border-black/[0.04] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <ModuleIcon code={row.code} className="h-[18px] w-[18px] text-navy" />
                      <span className="text-[14px] font-semibold text-navy">{row.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-t border-black/[0.04] px-5 py-4 text-[13.5px] font-medium text-navy">
                    {formatTzs(row.revenue)}
                  </td>
                  <td className="whitespace-nowrap border-t border-black/[0.04] px-5 py-4 text-[13.5px] font-medium text-navy">
                    {formatTzs(row.expenses)}
                  </td>
                  <td className="whitespace-nowrap border-t border-black/[0.04] px-5 py-4 text-[13.5px] font-semibold text-navy">
                    {formatTzs(row.operatingPosition)}
                  </td>
                  <td className="whitespace-nowrap border-t border-black/[0.04] px-5 py-4 text-[13.5px] font-medium text-navy">
                    {formatPercent(row.margin)}
                  </td>
                  <td className="border-t border-black/[0.04] px-5 py-4">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="border-t border-black/[0.04] px-5 py-4">
                    <div className="flex justify-end">
                      <Link
                        href={row.moduleHref}
                        className="inline-flex items-center gap-1 text-[13.5px] font-medium text-[#4d6480] transition duration-200 hover:text-navy"
                      >
                        View
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
