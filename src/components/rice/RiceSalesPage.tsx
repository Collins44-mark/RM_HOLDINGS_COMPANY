"use client";

import { useMemo, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { loadRiceSalesWorkspaceAction, type RiceSalesWorkspace } from "@/actions/rice/workspace";
import { recordRiceSaleAction, recordRiceSalePaymentAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, StatusPill, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import type { Translator } from "@/lib/i18n";
import { formatKg, RiceField, RiceNotice, RicePageHeader, RICE_METHODS, riceMethodKey, todayIso } from "@/components/rice/rice-ui";

export function RiceSalesPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceSalesWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => workspace?.items ?? [], [workspace]);
  const [form, setForm] = useState({
    partyId: "",
    partyName: "",
    partyPhone: "",
    occurredOn: todayIso(),
    dispatchOn: "",
    itemId: items[0]?.id ?? "",
    qtyKg: "",
    unitPrice: "",
    amountPaid: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });

  const selected = useMemo(() => items.find((row) => row.id === (form.itemId || items[0]?.id)), [form.itemId, items]);
  const total = (Number(form.qtyKg) || 0) * (Number(form.unitPrice) || 0);

  async function refresh(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const next = await loadRiceSalesWorkspaceAction({ period, page, pageSize });
    if (next.ok) setWorkspace(next.workspace);
    else setError(next.error);
  }

  function statusLabel(row: { balance: number; paid: number }) {
    if (row.balance <= 0) return t("status.paid");
    if (row.paid > 0) return t("status.partial");
    return t("status.unpaid");
  }

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={CircleDollarSign}
        title={t("rice.sales.title")}
        subtitle={t("rice.sales.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      {workspace?.caps.canSell ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.sales.record")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label={t("rice.sales.buyer")}>
              <select className={inputClass} value={form.partyId} onChange={(event) => setForm({ ...form, partyId: event.target.value })}>
                <option value="">{t("rice.sales.newBuyer")}</option>
                {(workspace?.parties ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </RiceField>
            {!form.partyId ? (
              <>
                <RiceField label={t("rice.sales.buyerName")}>
                  <input className={inputClass} value={form.partyName} onChange={(event) => setForm({ ...form, partyName: event.target.value })} />
                </RiceField>
                <RiceField label={t("common.phone")}>
                  <input className={inputClass} value={form.partyPhone} onChange={(event) => setForm({ ...form, partyPhone: event.target.value })} />
                </RiceField>
              </>
            ) : null}
            <RiceField label={t("common.date")}>
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.sales.dispatch")}>
              <input type="date" className={inputClass} value={form.dispatchOn} onChange={(event) => setForm({ ...form, dispatchOn: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.sales.product")}>
              <select className={inputClass} value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
                {items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {formatKg(row.qtyKg, locale)}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label={t("rice.sales.qty")}>
              <input className={inputClass} value={form.qtyKg} onChange={(event) => setForm({ ...form, qtyKg: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.sales.unitPrice")}>
              <input className={inputClass} value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />
            </RiceField>
            <RiceField label={t("common.total")}>
              <input className={inputClass} readOnly value={formatTzs(total)} />
            </RiceField>
            <RiceField label={t("rice.purchases.method")}>
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {RICE_METHODS.map((row) => (
                  <option key={row.value} value={row.value}>
                    {t(riceMethodKey(row.value))}
                  </option>
                ))}
              </select>
            </RiceField>
            {form.paymentMethod !== "CREDIT" ? (
              <>
                <RiceField label={t("rice.purchases.amountPaid")}>
                  <input className={inputClass} value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} />
                </RiceField>
                <RiceField label={t("common.reference")}>
                  <input className={inputClass} value={form.paymentReference} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} />
                </RiceField>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-[12.5px] text-slate-500">{t("rice.sales.available", { qty: formatKg(selected?.qtyKg ?? 0, locale) })}</p>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={t("rice.sales.post")}
              busyLabel={t("common.posting")}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await recordRiceSaleAction({
                  requestId: crypto.randomUUID(),
                  partyId: form.partyId || undefined,
                  partyName: form.partyName,
                  partyPhone: form.partyPhone,
                  occurredOn: form.occurredOn,
                  dispatchOn: form.dispatchOn,
                  lines: [{ itemId: form.itemId || items[0]?.id || "", qtyKg: form.qtyKg, unitPrice: form.unitPrice }],
                  amountPaid: form.paymentMethod === "CREDIT" ? "0" : form.amountPaid,
                  paymentMethod: form.paymentMethod,
                  paymentReference: form.paymentReference,
                  notes: form.notes,
                });
                setBusy(false);
                if (!result.ok) setError(result.error);
                else {
                  setForm((current) => ({ ...current, qtyKg: "", amountPaid: "", paymentReference: "" }));
                  await refresh();
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.sales.posted")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("rice.purchases.no")}</th>
                <th className="px-3 py-2">{t("rice.sales.buyer")}</th>
                <th className="px-3 py-2">{t("rice.sales.items")}</th>
                <th className="px-3 py-2">{t("common.total")}</th>
                <th className="px-3 py-2">{t("common.balance")}</th>
                <th className="px-3 py-2">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.sales ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={7}>
                    {t("rice.sales.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.sales ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{row.lines.map((line) => `${line.itemName} ${formatKg(line.qtyKg, locale)}`).join(", ")}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.total)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.balance)}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill value={statusLabel(row)} />
                      {row.balance > 0 && workspace?.caps.canSell ? (
                        <SalePay
                          t={t}
                          onPay={async (amount) => {
                            const result = await recordRiceSalePaymentAction({ saleId: row.id, amount });
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
        <PaginationBar
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => void refresh(page, workspace?.listPage.pageSize)}
          onPageSize={(pageSize) => void refresh(1, pageSize)}
        />
      </section>
    </div>
  );
}

function SalePay({ t, onPay }: { t: Translator; onPay: (amount: string) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <input className="h-8 w-24 rounded-full border border-[#dbe4ef] px-2 text-[12px]" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t("common.pay")} />
      <button type="button" className="text-[12px] font-semibold text-navy" onClick={() => void onPay(amount).then(() => setAmount(""))}>
        {t("common.record")}
      </button>
    </span>
  );
}
