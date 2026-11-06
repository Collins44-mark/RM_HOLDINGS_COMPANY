"use client";

import { useRef, useState } from "react";
import { Package } from "lucide-react";
import { loadRiceStorageAccountAction, loadRiceStorageWorkspaceAction, type RiceStorageWorkspace } from "@/actions/rice/workspace";
import { recordRiceServiceIncomeAction, recordRiceStorageMovementAction } from "@/actions/rice/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { ContainedDrawer } from "@/components/ui/ContainedDrawer";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { useListPage } from "@/lib/property/use-list-page";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import type { RiceStorageAccount, RiceStorageMovement } from "@/lib/rice/types";
import { RiceListPeriodFilter } from "@/components/rice/RiceListPeriodFilter";
import {
  formatKg,
  formatRiceDate,
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
  const [movePeriod, setMovePeriod] = useState<ReportPeriod>(period);
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [servicePeriod, setServicePeriod] = useState<ReportPeriod>(period);
  const [serviceFrom, setServiceFrom] = useState("");
  const [serviceTo, setServiceTo] = useState("");
  const [viewing, setViewing] = useState<RiceStorageAccount | null>(null);
  const [accountMoves, setAccountMoves] = useState<RiceStorageMovement[]>([]);
  const depositRef = useRef<HTMLDivElement>(null);
  const feeRef = useRef<HTMLDivElement>(null);
  const accounts = useListPage(workspace?.accounts ?? [], String((workspace?.accounts ?? []).length));

  function ranges() {
    return {
      movementPeriod: movePeriod,
      movementFrom: movePeriod === "custom" ? moveFrom : undefined,
      movementTo: movePeriod === "custom" ? moveTo : undefined,
      servicePeriod,
      serviceFrom: servicePeriod === "custom" ? serviceFrom : undefined,
      serviceTo: servicePeriod === "custom" ? serviceTo : undefined,
    };
  }

  async function refresh(
    next: {
      movementPeriod?: ReportPeriod;
      movementFrom?: string;
      movementTo?: string;
      movementPage?: number;
      movementPageSize?: number;
      servicePeriod?: ReportPeriod;
      serviceFrom?: string;
      serviceTo?: string;
      servicePage?: number;
      servicePageSize?: number;
    } = {},
  ) {
    const current = ranges();
    const movementPeriod = next.movementPeriod ?? current.movementPeriod;
    const servicePeriodValue = next.servicePeriod ?? current.servicePeriod;
    const movementFrom = next.movementFrom ?? current.movementFrom;
    const movementTo = next.movementTo ?? current.movementTo;
    const serviceFromValue = next.serviceFrom ?? current.serviceFrom;
    const serviceToValue = next.serviceTo ?? current.serviceTo;
    if (movementPeriod === "custom" && (!movementFrom || !movementTo)) return;
    if (servicePeriodValue === "custom" && (!serviceFromValue || !serviceToValue)) return;
    const loaded = await loadRiceStorageWorkspaceAction({
      movementPeriod,
      movementFrom,
      movementTo,
      movementPage: next.movementPage ?? workspace?.movementPage.page ?? 1,
      movementPageSize: next.movementPageSize ?? workspace?.movementPage.pageSize ?? 10,
      servicePeriod: servicePeriodValue,
      serviceFrom: serviceFromValue,
      serviceTo: serviceToValue,
      servicePage: next.servicePage ?? workspace?.servicePage.page ?? 1,
      servicePageSize: next.servicePageSize ?? workspace?.servicePage.pageSize ?? 10,
    });
    if (loaded.ok) setWorkspace(loaded.workspace);
    else setError(loaded.error);
  }

  function chooseAccount(account: RiceStorageAccount, action: "DEPOSIT" | "RELEASE" | "FEE") {
    if (action === "FEE") {
      setFee((current) => ({ ...current, accountId: account.id }));
      feeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setMove((current) => ({ ...current, accountId: account.id, movementType: action }));
    depositRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openAccount(account: RiceStorageAccount) {
    setViewing(account);
    setAccountMoves([]);
    const detail = await loadRiceStorageAccountAction(account.id);
    if (detail.ok) setAccountMoves(detail.movements);
    else setError(detail.error);
  }

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Package} title={t("rice.storage.title")} subtitle={t("rice.storage.subtitle")} />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      {workspace?.caps.canStorage ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div ref={depositRef} className={glassPanel}>
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
                    if (!saved.queued) await refresh({ movementPage: 1 });
                  }
                }}
              />
            </div>
          </div>

          <div ref={feeRef} className={glassPanel}>
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
                    if (!saved.queued) await refresh({ servicePage: 1 });
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
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.storage.balancesEmpty")}
                  </td>
                </tr>
              ) : (
                accounts.rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5 font-medium">{row.accountNumber}</td>
                    <td className="px-3 py-2.5">{row.partyName}</td>
                    <td className="px-3 py-2.5">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <CompactActionsMenu
                        ariaLabel={`${t("rice.storage.view")} ${row.partyName}`}
                        items={[
                          { label: t("rice.storage.view"), onSelect: () => void openAccount(row) },
                          ...(workspace?.caps.canStorage
                            ? [
                                { label: t("rice.storage.deposit"), onSelect: () => chooseAccount(row, "DEPOSIT") },
                                { label: t("rice.storage.release"), onSelect: () => chooseAccount(row, "RELEASE") },
                                { label: t("rice.storage.serviceFee"), onSelect: () => chooseAccount(row, "FEE") },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          showWhenEmpty
          page={accounts.page}
          total={workspace?.accounts.length ?? 0}
          pageSize={accounts.pageSize}
          onPage={accounts.setPage}
          onPageSize={accounts.setPageSize}
        />
      </section>

      <section className={glassPanel}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.movements")}</h2>
          <RiceListPeriodFilter
            period={movePeriod}
            from={moveFrom}
            to={moveTo}
            onChange={(next) => {
              setMovePeriod(next.period);
              setMoveFrom(next.from);
              setMoveTo(next.to);
              void refresh({ movementPeriod: next.period, movementFrom: next.from, movementTo: next.to, movementPage: 1 });
            }}
          />
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                <th className="px-3 py-2">{t("rice.storage.type")}</th>
                <th className="px-3 py-2">{t("rice.purchases.qty")}</th>
                <th className="px-3 py-2">{t("rice.storage.reference")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    {t("rice.storage.movementsEmpty")}
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
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
          showWhenEmpty
          page={workspace?.movementPage.page ?? 1}
          total={workspace?.movementPage.total ?? 0}
          pageSize={workspace?.movementPage.pageSize ?? 10}
          onPage={(page) => void refresh({ movementPage: page })}
          onPageSize={(pageSize) => void refresh({ movementPage: 1, movementPageSize: pageSize })}
        />
      </section>

      <section className={glassPanel}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.storage.serviceIncome")}</h2>
          <RiceListPeriodFilter
            period={servicePeriod}
            from={serviceFrom}
            to={serviceTo}
            onChange={(next) => {
              setServicePeriod(next.period);
              setServiceFrom(next.from);
              setServiceTo(next.to);
              void refresh({ servicePeriod: next.period, serviceFrom: next.from, serviceTo: next.to, servicePage: 1 });
            }}
          />
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.storage.no")}</th>
                <th className="px-3 py-2">{t("rice.storage.feeType")}</th>
                <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                <th className="px-3 py-2">{t("rice.storage.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.services ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    {t("rice.storage.serviceEmpty")}
                  </td>
                </tr>
              ) : (
                (workspace?.services ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5 font-medium">{row.number}</td>
                    <td className="px-3 py-2.5">{t(riceFeeKindKey(row.kind))}</td>
                    <td className="px-3 py-2.5">{row.partyName ?? "—"}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          showWhenEmpty
          page={workspace?.servicePage.page ?? 1}
          total={workspace?.servicePage.total ?? 0}
          pageSize={workspace?.servicePage.pageSize ?? 10}
          onPage={(page) => void refresh({ servicePage: page })}
          onPageSize={(pageSize) => void refresh({ servicePage: 1, servicePageSize: pageSize })}
        />
      </section>
      {viewing ? (
        <CustomerDrawer
          account={viewing}
          movements={accountMoves}
          canAct={Boolean(workspace?.caps.canStorage)}
          onClose={() => setViewing(null)}
          onAction={(action) => {
            chooseAccount(viewing, action);
            setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomerDrawer({
  account,
  movements,
  canAct,
  onClose,
  onAction,
}: {
  account: RiceStorageAccount;
  movements: RiceStorageMovement[];
  canAct: boolean;
  onClose: () => void;
  onAction: (action: "DEPOSIT" | "RELEASE" | "FEE") => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const facts = [
    [t("rice.storage.account"), account.accountNumber],
    [t("rice.storage.customer"), account.partyName],
    [t("rice.storage.phone"), account.phone || "—"],
    [t("rice.storage.balance"), formatKg(account.qtyKg, locale)],
  ];
  return (
    <ContainedDrawer
      title={account.partyName}
      subtitle={t("rice.storage.profile")}
      onClose={onClose}
      footer={
        canAct ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={() => onAction("DEPOSIT")}>
              {t("rice.storage.deposit")}
            </button>
            <button type="button" className="text-[13px] font-semibold text-navy" onClick={() => onAction("RELEASE")}>
              {t("rice.storage.release")}
            </button>
            <button type="button" className="text-[13px] font-semibold text-navy" onClick={() => onAction("FEE")}>
              {t("rice.storage.serviceFee")}
            </button>
          </div>
        ) : null
      }
    >
      <dl className="grid grid-cols-2 gap-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#f4f7fb] px-3 py-3">
            <dt className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 text-[14px] font-semibold text-navy">{t("rice.storage.storages")}</h3>
      <ul className="mt-2 divide-y divide-navy/5 rounded-2xl border border-navy/5">
        {movements.length === 0 ? (
          <li className="px-3 py-3 text-[13.5px] text-slate-500">{t("rice.storage.movementsEmpty")}</li>
        ) : (
          movements.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13.5px] text-navy">
              <span>
                <span className="block font-medium">{t(riceMoveTypeKey(row.type))}</span>
                <span className="text-[12px] text-slate-500">{formatRiceDate(row.occurredOn)}</span>
              </span>
              <span className="text-right">
                <span className="block font-semibold">{formatKg(row.qtyKg, locale)}</span>
                <span className="text-[12px] text-slate-500">{row.reference || "—"}</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </ContainedDrawer>
  );
}
