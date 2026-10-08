"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { listSchoolExpensesAction, type SchoolExpensesResult } from "@/actions/school/transport";
import { glassPanel, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { transportInputClass } from "@/lib/school/transport-ui";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";

function sourceLabel(value: string) {
  if (value === "TRANSPORT_FUEL") return "Transport / Fuel";
  if (value === "TRANSPORT_MAINTENANCE") return "Transport / Maintenance";
  return "School expense";
}

export function SchoolExpensesPage({ initial }: { initial: SchoolExpensesResult }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [rows, setRows] = useState(ready ? initial.expenses : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [q, setQ] = useState("");

  function load(nextPage: number, nextQ = q) {
    void listSchoolExpensesAction({ page: nextPage, q: nextQ }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.expenses);
      setPage(result.page);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Expenses</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">School expenses, including linked transport fuel and maintenance.</p>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load(1);
        }}
      >
        <input className={cn(transportInputClass, "min-w-[220px] flex-1")} value={q} placeholder="Search expense no. or description" onChange={(event) => setQ(event.target.value)} />
      </form>
      {rows.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Wallet} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No school expenses recorded yet.</h2>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Expense No.", "Category", "Source", "Description", "Amount"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{row.expenseDate}</td>
                    <td className="px-4 py-3">{row.expenseNumber}</td>
                    <td className="px-4 py-3">{row.categoryName}</td>
                    <td className="px-4 py-3">{sourceLabel(row.sourceType)}</td>
                    <td className="px-4 py-3">{row.description || row.reference || "—"}</td>
                    <td className="px-4 py-3">{formatTzs(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next)} />
        </section>
      )}
    </div>
  );
}
