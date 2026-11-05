"use client";

import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";

export function PagedReportTable({
  columns,
  rows,
  resetKey,
  empty = "No records in this period.",
}: {
  columns: Array<{ key: string; label: string; align?: string }>;
  rows: Array<Record<string, string | number>>;
  resetKey: string;
  empty?: string;
}) {
  const page = useListPage(rows, resetKey);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              page.rows.map((row, index) => (
                <tr key={`${page.page}-${index}`} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`}>
                      {row[column.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page.page} total={rows.length} pageSize={page.pageSize} onPage={page.setPage} onPageSize={page.setPageSize} />
    </>
  );
}
