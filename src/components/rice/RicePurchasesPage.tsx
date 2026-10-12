"use client";

import { useMemo, useState } from "react";
import { Wheat } from "lucide-react";
import { loadRicePurchasesWorkspaceAction, type RicePurchasesWorkspace } from "@/actions/rice/workspace";
import { recordRicePurchaseAction, recordRicePurchasePaymentAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { formatKg, RiceField, RiceNotice, RicePageHeader, RICE_METHODS, todayIso } from "@/components/rice/rice-ui";
import { StatusPill } from "@/components/supermarket/purchasing-ui";

export function RicePurchasesPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RicePurchasesWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const paddyItems = useMemo(() => (workspace?.items ?? []).filter((row) => row.kind === "PADDY"), [workspace]);
  const [form, setForm] = useState({
    partyId: "",
    partyName: "",
    partyPhone: "",
    occurredOn: todayIso(),
    itemId: paddyItems[0]?.id ?? "",
    bags: "",
    qtyKg: "",
    unitPrice: "",
    amountPaid: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });

  async function refresh() {
    const result = await loadRicePurchasesWorkspaceAction({ period });
    if (result.ok) setWorkspace(result.workspace);
    else setError(result.error);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await recordRicePurchaseAction({
      requestId: crypto.randomUUID(),
      itemId: form.itemId || paddyItems[0]?.id || "",
      partyId: form.partyId || undefined,
      partyName: form.partyName,
      partyPhone: form.partyPhone,
      occurredOn: form.occurredOn,
      bags: form.bags,
      qtyKg: form.qtyKg,
      unitPrice: form.unitPrice,
      amountPaid: form.paymentMethod === "CREDIT" ? "0" : form.amountPaid,
      paymentMethod: form.paymentMethod,
      paymentReference: form.paymentReference,
      notes: form.notes,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm((current) => ({ ...current, qtyKg: "", bags: "", amountPaid: "", paymentReference: "", notes: "" }));
    await refresh();
  }

  const canCreate = workspace?.caps.canPurchase;
  const total = (Number(form.qtyKg) || 0) * (Number(form.unitPrice) || 0);

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={Wheat}
        title="Purchases"
        subtitle="Company-owned paddy purchases. Customer-stored paddy is recorded separately."
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      {canCreate ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">Record purchase</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label="Supplier">
              <select className={inputClass} value={form.partyId} onChange={(event) => setForm({ ...form, partyId: event.target.value })}>
                <option value="">New supplier</option>
                {(workspace?.parties ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </RiceField>
            {!form.partyId ? (
              <>
                <RiceField label="Supplier name">
                  <input className={inputClass} value={form.partyName} onChange={(event) => setForm({ ...form, partyName: event.target.value })} />
                </RiceField>
                <RiceField label="Phone">
                  <input className={inputClass} value={form.partyPhone} onChange={(event) => setForm({ ...form, partyPhone: event.target.value })} />
                </RiceField>
              </>
            ) : null}
            <RiceField label="Date">
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label="Item">
              <select className={inputClass} value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
                {paddyItems.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label="Bags">
              <input className={inputClass} inputMode="decimal" value={form.bags} onChange={(event) => setForm({ ...form, bags: event.target.value })} />
            </RiceField>
            <RiceField label="Weight (kg)">
              <input className={inputClass} inputMode="decimal" value={form.qtyKg} onChange={(event) => setForm({ ...form, qtyKg: event.target.value })} />
            </RiceField>
            <RiceField label="Unit price">
              <input className={inputClass} inputMode="decimal" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />
            </RiceField>
            <RiceField label="Total">
              <input className={inputClass} readOnly value={formatTzs(total)} />
            </RiceField>
            <RiceField label="Payment method">
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {RICE_METHODS.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </RiceField>
            {form.paymentMethod !== "CREDIT" ? (
              <>
                <RiceField label="Amount paid">
                  <input className={inputClass} inputMode="decimal" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} />
                </RiceField>
                <RiceField label="Reference">
                  <input className={inputClass} value={form.paymentReference} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} />
                </RiceField>
              </>
            ) : null}
            <RiceField label="Notes">
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Post purchase" busyLabel="Posting…" onClick={() => void save()} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Posted purchases</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.purchases ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={8}>
                    No purchases in this period.
                  </td>
                </tr>
              ) : (
                (workspace?.purchases ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.total)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.paid)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.balance)}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill value={row.balance <= 0 ? "Paid" : row.paid > 0 ? "Partial" : "Unpaid"} />
                      {row.balance > 0 && canCreate ? (
                        <PayButton
                          onPay={async (amount) => {
                            const result = await recordRicePurchasePaymentAction({ purchaseId: row.id, amount });
                            if (!result.ok) setError(result.error);
                            else await refresh();
                          }}
                        />
                      ) : null}
                    </td>
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

function PayButton({ onPay }: { onPay: (amount: string) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <input className="h-8 w-24 rounded-full border border-[#dbe4ef] px-2 text-[12px]" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Pay" />
      <button
        type="button"
        className="text-[12px] font-semibold text-navy"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onPay(amount);
          setBusy(false);
          setAmount("");
        }}
      >
        Record
      </button>
    </span>
  );
}
