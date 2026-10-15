"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import { loadRiceWarehouseWorkspaceAction, type RiceWarehouseWorkspace } from "@/actions/rice/workspace";
import { adjustRiceStockAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useT } from "@/components/i18n/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { formatKg, RiceField, RiceNotice, RicePageHeader, riceWarehouseSourceKey, todayIso } from "@/components/rice/rice-ui";
import { RICE_WAREHOUSE_KIND_ORDER, riceWarehouseKindSlug } from "@/lib/rice/warehouse-kind";

export function RiceWarehousePage({
  initial,
}: {
  initial: { ok: true; workspace: RiceWarehouseWorkspace } | { ok: false; error: string };
}) {
  const t = useT();
  const requestId = useRef(0);
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ itemId: "", qtyKg: "", reason: "", occurredOn: todayIso() });

  async function reload(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const id = ++requestId.current;
    const next = await loadRiceWarehouseWorkspaceAction({ page, pageSize });
    if (id !== requestId.current) return;
    if (next.ok) setWorkspace(next.workspace);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await adjustRiceStockAction({
      requestId: crypto.randomUUID(),
      itemId: form.itemId,
      qtyKg: form.qtyKg,
      reason: form.reason,
      occurredOn: form.occurredOn,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await reload(1, workspace?.listPage.pageSize ?? 10);
    setForm({ itemId: form.itemId, qtyKg: "", reason: "", occurredOn: todayIso() });
  }

  const items = workspace?.items ?? [];

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Warehouse} title={t("rice.warehouse.title")} subtitle={t("rice.warehouse.subtitle")} />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {RICE_WAREHOUSE_KIND_ORDER.map((kind) => {
          const qty = items.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.qtyKg, 0);
          return (
            <Link
              key={kind}
              href={`/rice/warehouse/${riceWarehouseKindSlug(kind)}`}
              className={`${glassCard} px-5 py-5 transition duration-200 hover:bg-white/80`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{t(`rice.kindGroup.${kind}` as MessageKey)}</p>
              <p className="mt-2 text-[22px] font-semibold text-navy">{formatKg(qty)}</p>
            </Link>
          );
        })}
      </section>

      {workspace?.caps.canAdjust ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.warehouse.correction")}</h2>
          <p className="mt-1 text-[13px] text-slate-500">{t("rice.warehouse.correctionHint")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <RiceField label={t("common.item")}>
              <select className={inputClass} value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
                <option value="">{t("common.selectItem")}</option>
                {items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label={t("common.quantity")}>
              <input className={inputClass} value={form.qtyKg} onChange={(event) => setForm({ ...form, qtyKg: event.target.value })} />
            </RiceField>
            <RiceField label={t("common.date")}>
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.warehouse.reason")}>
              <input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("rice.warehouse.post")} busyLabel={t("rice.purchases.posting")} onClick={() => void save()} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.warehouse.movements")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("common.item")}</th>
                <th className="px-3 py-2">{t("common.type")}</th>
                <th className="px-3 py-2">{t("common.quantity")}</th>
                <th className="px-3 py-2">{t("common.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.warehouse.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.itemName}</td>
                    <td className="px-3 py-2.5">{t(riceWarehouseSourceKey(row.sourceType))}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{row.notes ?? "—"}</td>
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
          onPage={(page) => void reload(page, workspace?.listPage.pageSize)}
          onPageSize={(pageSize) => void reload(1, pageSize)}
        />
      </section>
    </div>
  );
}
