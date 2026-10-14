"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { loadRiceStorageWorkspaceAction, type RiceStorageWorkspace } from "@/actions/rice/workspace";
import { recordRiceServiceIncomeAction, recordRiceStorageMovementAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatKg, RiceField, RiceNotice, RicePageHeader, RICE_METHODS, todayIso } from "@/components/rice/rice-ui";

export function RiceStoragePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceStorageWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState({
    accountId: "",
    partyName: "",
    partyPhone: "",
    movementType: "DEPOSIT" as "DEPOSIT" | "RELEASE",
    occurredOn: todayIso(),
    bags: "",
    qtyKg: "",
    reference: "",
    notes: "",
  });
  const [fee, setFee] = useState({
    accountId: "",
    kind: "STORAGE",
    occurredOn: todayIso(),
    amount: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });

  async function refresh(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const next = await loadRiceStorageWorkspaceAction({ period, page, pageSize });
    if (next.ok) setWorkspace(next.workspace);
    else setError(next.error);
  }

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={Package}
        title="Customer Storage"
        subtitle="Customer-owned paddy is not company inventory, revenue, or a purchase. Only posted service fees count as income."
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      {workspace?.caps.canStorage ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Deposit or release</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RiceField label="Existing account">
                <select className={inputClass} value={move.accountId} onChange={(event) => setMove({ ...move, accountId: event.target.value })}>
                  <option value="">New customer</option>
                  {(workspace?.accounts ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.partyName} · {formatKg(row.qtyKg)}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label="Type">
                <select className={inputClass} value={move.movementType} onChange={(event) => setMove({ ...move, movementType: event.target.value as "DEPOSIT" | "RELEASE" })}>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="RELEASE">Release</option>
                </select>
              </RiceField>
              {!move.accountId ? (
                <>
                  <RiceField label="Customer name">
                    <input className={inputClass} value={move.partyName} onChange={(event) => setMove({ ...move, partyName: event.target.value })} />
                  </RiceField>
                  <RiceField label="Phone">
                    <input className={inputClass} value={move.partyPhone} onChange={(event) => setMove({ ...move, partyPhone: event.target.value })} />
                  </RiceField>
                </>
              ) : null}
              <RiceField label="Date">
                <input type="date" className={inputClass} value={move.occurredOn} onChange={(event) => setMove({ ...move, occurredOn: event.target.value })} />
              </RiceField>
              <RiceField label="Bags">
                <input className={inputClass} value={move.bags} onChange={(event) => setMove({ ...move, bags: event.target.value })} />
              </RiceField>
              <RiceField label="Quantity (kg)">
                <input className={inputClass} value={move.qtyKg} onChange={(event) => setMove({ ...move, qtyKg: event.target.value })} />
              </RiceField>
              <RiceField label="Reference">
                <input className={inputClass} value={move.reference} onChange={(event) => setMove({ ...move, reference: event.target.value })} />
              </RiceField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Post movement"
                busyLabel="Posting…"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const result = await recordRiceStorageMovementAction({
                    requestId: crypto.randomUUID(),
                    accountId: move.accountId || undefined,
                    partyName: move.partyName,
                    partyPhone: move.partyPhone,
                    movementType: move.movementType,
                    occurredOn: move.occurredOn,
                    bags: move.bags,
                    qtyKg: move.qtyKg,
                    reference: move.reference,
                    notes: move.notes,
                  });
                  setBusy(false);
                  if (!result.ok) setError(result.error);
                  else {
                    setMove((current) => ({ ...current, qtyKg: "", bags: "", reference: "" }));
                    await refresh();
                  }
                }}
              />
            </div>
          </div>

          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Service fee</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RiceField label="Customer account">
                <select className={inputClass} value={fee.accountId} onChange={(event) => setFee({ ...fee, accountId: event.target.value })}>
                  <option value="">Select account</option>
                  {(workspace?.accounts ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.partyName}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label="Fee type">
                <select className={inputClass} value={fee.kind} onChange={(event) => setFee({ ...fee, kind: event.target.value })}>
                  <option value="STORAGE">Storage</option>
                  <option value="MILLING">Milling</option>
                  <option value="GRADING">Grading</option>
                  <option value="HANDLING">Handling</option>
                </select>
              </RiceField>
              <RiceField label="Date">
                <input type="date" className={inputClass} value={fee.occurredOn} onChange={(event) => setFee({ ...fee, occurredOn: event.target.value })} />
              </RiceField>
              <RiceField label="Amount">
                <input className={inputClass} value={fee.amount} onChange={(event) => setFee({ ...fee, amount: event.target.value })} />
              </RiceField>
              <RiceField label="Payment method">
                <select className={inputClass} value={fee.paymentMethod} onChange={(event) => setFee({ ...fee, paymentMethod: event.target.value })}>
                  {RICE_METHODS.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label="Reference">
                <input className={inputClass} value={fee.paymentReference} onChange={(event) => setFee({ ...fee, paymentReference: event.target.value })} />
              </RiceField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Post fee"
                busyLabel="Posting…"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const result = await recordRiceServiceIncomeAction({
                    requestId: crypto.randomUUID(),
                    accountId: fee.accountId,
                    kind: fee.kind,
                    occurredOn: fee.occurredOn,
                    amount: fee.amount,
                    paymentMethod: fee.paymentMethod,
                    paymentReference: fee.paymentReference,
                    notes: fee.notes,
                  });
                  setBusy(false);
                  if (!result.ok) setError(result.error);
                  else {
                    setFee((current) => ({ ...current, amount: "" }));
                    await refresh();
                  }
                }}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Customer balances</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.accounts ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    No customer storage accounts yet.
                  </td>
                </tr>
              ) : (
                (workspace?.accounts ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.accountNumber}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Movements</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    No storage movements yet.
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{row.type}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                    <td className="px-3 py-2.5">{row.reference ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => void refresh(page, workspace?.listPage.pageSize)}
          onPageSize={(pageSize) => void refresh(1, pageSize)}
        />
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Service income ({workspace?.periodLabel ?? ""})</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.services ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    No service income in this period.
                  </td>
                </tr>
              ) : (
                (workspace?.services ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{row.kind}</td>
                    <td className="px-3 py-2.5">{row.partyName ?? "—"}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
