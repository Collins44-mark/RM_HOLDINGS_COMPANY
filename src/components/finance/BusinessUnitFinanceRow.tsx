import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { MarginBadge } from "@/components/finance/MarginBadge";
import { formatTzs } from "@/lib/format/currency";
import type { UnitFinanceRow } from "@/lib/data/finance";

export function BusinessUnitFinanceRow({
  index,
  row,
}: {
  index: number;
  row: UnitFinanceRow;
}) {
  return (
    <tr className="border-b border-[color:var(--color-line)] last:border-0 hover:bg-[#f8fafc]/80">
      <td className="whitespace-nowrap px-5 py-4 text-[13.5px] font-medium text-slate-400">
        {index}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: row.tint, color: row.accent }}
          >
            <ModuleIcon code={row.code} className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[14px] font-semibold text-navy">{row.name}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-medium text-navy">
        {formatTzs(row.revenue)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-medium text-navy">
        {formatTzs(row.expenses)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right text-[13.5px] font-semibold text-navy">
        {formatTzs(row.operatingPosition)}
      </td>
      <td className="px-5 py-4">
        <MarginBadge value={row.margin} />
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={row.href}
            className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-white px-3 text-[12.5px] font-medium text-navy transition duration-200 hover:border-black/12 hover:bg-slate-50"
          >
            View
          </Link>
          <Link
            href={row.href}
            aria-label={`Open ${row.name} finance`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.06] bg-[#f4f6fa] text-slate-500 transition duration-200 hover:bg-white hover:text-navy"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </td>
    </tr>
  );
}
