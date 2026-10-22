"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { loadRiceStorageWorkspaceAction, type RiceStorageWorkspace } from "@/actions/rice/workspace";
import { recordRiceServiceIncomeAction, recordRiceStorageMovementAction } from "@/actions/rice/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import {
  formatKg,
  RiceField,
  RiceNotice,
  RicePageHeader,
  RICE_METHODS,
  riceFeeKindKey,
  riceMethodKey,
  riceMoveTypeKey,
  todayIso,
} from "@/components/rice/rice-ui";

export function RiceStoragePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceStorageWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const { locale } = useLocale();
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
        title={t("rice.storage.title")}
        subtitle={t("rice.storage.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      {workspace?.caps.canStorage ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.depositRelease")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RiceField label={t("rice.storage.existingAccount")}>
                <select className={inputClass} value={move.accountId} onChange={(event) => setMove({ ...move, accountId: event.target.value })}>
                  <option value="">{t("rice.storage.newCustomer")}</option>
                  {(workspace?.accounts ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.partyName} · {formatKg(row.qtyKg, locale)}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label={t("rice.storage.type")}>
                <select className={inputClass} value={move.movementType} onChange={(event) => setMove({ ...move, movementType: event.target.value as "DEPOSIT" | "RELEASE" })}>
                  <option value="DEPOSIT">{t("rice.storage.deposit")}</option>
                  <option value="RELEASE">{t("rice.storage.release")}</option>
                </select>
              </RiceField>
              {!move.accountId ? (
                <>
                  <RiceField label={t("rice.storage.customerName")}>
                    <input className={inputClass} value={move.partyName} onChange={(event) => setMove({ ...move, partyName: event.target.value })} />
                  </RiceField>
                  <RiceField label={t("rice.storage.phone")}>
                    <input className={inputClass} value={move.partyPhone} onChange={(event) => setMove({ ...move, partyPhone: event.target.value })} />
                  </RiceField>
                </>
              ) : null}
              <RiceField label={t("rice.storage.date")}>
                <input type="date" className={inputClass} value={move.occurredOn} onChange={(event) => setMove({ ...move, occurredOn: event.target.value })} />
              </RiceField>
              <RiceField label={t("rice.storage.bags")}>
                <input className={inputClass} value={move.bags} onChange={(event) => setMove({ ...move, bags: event.target.value })} />
              </RiceField>
              <RiceField label={t("rice.storage.qty")}>
                <input className={inputClass} value={move.qtyKg} onChange={(event) => setMove({ ...move, qtyKg: event.target.value })} />
              </RiceField>
              <RiceField label={t("rice.storage.reference")}>
                <input className={inputClass} value={move.reference} onChange={(event) => setMove({ ...move, reference: event.target.value })} />
              </RiceField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel={t("rice.storage.postMovement")}
                busyLabel={t("common.posting")}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const requestId = crypto.randomUUID();
                  const payload = {
                    requestId,
                    accountId: move.accountId || undefined,
                    partyName: move.partyName,
                    partyPhone: move.partyPhone,
                    movementType: move.movementType,
                    occurredOn: move.occurredOn,
                    bags: move.bags,
                    qtyKg: move.qtyKg,
                    reference: move.reference,
                    notes: move.notes,
                  };
                  const saved = await saveWithOutbox(
                    { id: requestId, type: "rice.record_storage_movement", businessUnitCode: "rice", payload },
                    () => recordRiceStorageMovementAction(payload),
                  );
                  setBusy(false);
                  if (saved.error) setError(saved.error);
                  else {
                    setMove((current) => ({ ...current, qtyKg: "", bags: "", reference: "" }));
                    if (!saved.queued) await refresh();
                  }
                }}
              />
            </div>
          </div>

          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.serviceFee")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RiceField label={t("rice.storage.customerAccount")}>
                <select className={inputClass} value={fee.accountId} onChange={(event) => setFee({ ...fee, accountId: event.target.value })}>
                  <option value="">{t("common.selectAccount")}</option>
                  {(workspace?.accounts ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.partyName}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label={t("rice.storage.feeType")}>
                <select className={inputClass} value={fee.kind} onChange={(event) => setFee({ ...fee, kind: event.target.value })}>
                  <option value="STORAGE">{t("rice.storage.fee.STORAGE")}</option>
                  <option value="MILLING">{t("rice.storage.fee.MILLING")}</option>
                  <option value="GRADING">{t("rice.storage.fee.GRADING")}</option>
                  <option value="HANDLING">{t("rice.storage.fee.HANDLING")}</option>
                </select>
              </RiceField>
              <RiceField label={t("rice.storage.date")}>
                <input type="date" className={inputClass} value={fee.occurredOn} onChange={(event) => setFee({ ...fee, occurredOn: event.target.value })} />
              </RiceField>
              <RiceField label={t("rice.storage.amount")}>
                <input className={inputClass} value={fee.amount} onChange={(event) => setFee({ ...fee, amount: event.target.value })} />
              </RiceField>
              <RiceField label={t("rice.storage.paymentMethod")}>
                <select className={inputClass} value={fee.paymentMethod} onChange={(event) => setFee({ ...fee, paymentMethod: event.target.value })}>
                  {RICE_METHODS.map((row) => (
                    <option key={row.value} value={row.value}>
                      {t(riceMethodKey(row.value))}
                    </option>
                  ))}
                </select>
              </RiceField>
              <RiceField label={t("rice.storage.reference")}>
                <input className={inputClass} value={fee.paymentReference} onChange={(event) => setFee({ ...fee, paymentReference: event.target.value })} />
              </RiceField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel={t("rice.storage.postFee")}
                busyLabel={t("common.posting")}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const requestId = crypto.randomUUID();
                  const payload = {
                    requestId,
                    accountId: fee.accountId,
                    kind: fee.kind,
                    occurredOn: fee.occurredOn,
                    amount: fee.amount,
                    paymentMethod: fee.paymentMethod,
                    paymentReference: fee.paymentReference,
                    notes: fee.notes,
                  };
                  const saved = await saveWithOutbox(
                    { id: requestId, type: "rice.record_service_income", businessUnitCode: "rice", payload },
                    () => recordRiceServiceIncomeAction(payload),
                  );
                  setBusy(false);
                  if (saved.error) setError(saved.error);
                  else {
                    setFee((current) => ({ ...current, amount: "" }));
                    if (!saved.queued) await refresh();
                  }
                }}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.balances")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.storage.account")}</th>
                <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                <th className="px-3 py-2">{t("rice.storage.phone")}</th>
                <th className="px-3 py-2">{t("rice.storage.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.accounts ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    {t("rice.storage.balancesEmpty")}
                  </td>
                </tr>
              ) : (
                (workspace?.accounts ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.accountNumber}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.movements")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.storage.date")}</th>
                <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                <th className="px-3 py-2">{t("rice.storage.type")}</th>
                <th className="px-3 py-2">{t("rice.purchases.qty")}</th>
                <th className="px-3 py-2">{t("rice.storage.reference")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.storage.movementsEmpty")}
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{t(riceMoveTypeKey(row.type))}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
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
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.serviceIncome", { period: workspace?.periodLabel ?? "" })}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.storage.date")}</th>
                <th className="px-3 py-2">{t("rice.storage.no")}</th>
                <th className="px-3 py-2">{t("rice.storage.feeType")}</th>
                <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                <th className="px-3 py-2">{t("rice.storage.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.services ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.storage.serviceEmpty")}
                  </td>
                </tr>
              ) : (
                (workspace?.services ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{t(riceFeeKindKey(row.kind))}</td>
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
