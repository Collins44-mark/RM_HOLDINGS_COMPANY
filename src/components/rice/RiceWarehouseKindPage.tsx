"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import {
  loadRiceWarehouseKindWorkspaceAction,
  type RiceWarehouseKindWorkspace,
} from "@/actions/rice/workspace";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";
import { formatTzs } from "@/lib/format/currency";
import { glassCard, glassPanel, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { formatKg, RiceNotice, RicePageHeader } from "@/components/rice/rice-ui";
import type { RiceWarehouseKindSlug } from "@/lib/rice/warehouse-kind";

function sourceKey(type: string): MessageKey {
  if (type === "PURCHASE") return "rice.warehouse.source.purchase";
  if (type === "MILL_IN") return "rice.warehouse.source.millIn";
  if (type === "MILL_OUT") return "rice.warehouse.source.millOut";
  if (type === "SALE") return "rice.warehouse.source.sale";
  if (type === "ADJUST") return "rice.warehouse.source.adjust";
  return "common.type";
}

export function RiceWarehouseKindPage({
  slug,
  initial,
}: {
  slug: RiceWarehouseKindSlug;
  initial: { ok: true; workspace: RiceWarehouseKindWorkspace } | { ok: false; error: string };
}) {
  const t = useT();
  const { locale } = useLocale();
  const requestId = useRef(0);
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);

  async function reload(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const id = ++requestId.current;
    const next = await loadRiceWarehouseKindWorkspaceAction({ kind: slug, page, pageSize });
    if (id !== requestId.current) return;
    if (next.ok) {
      setWorkspace(next.workspace);
      setError(null);
    } else setError(next.error);
  }

  const kind = workspace?.kind ?? "PADDY";
  const items = workspace?.items ?? [];
  const qty = workspace?.totalQtyKg ?? 0;
  const value = workspace?.totalValueTzs ?? 0;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <PageBackButton href="/rice/warehouse" label={t("rice.warehouse.back")} />
        <Link href="/rice/warehouse" className={secondaryButton}>
          {t("rice.warehouse.back")}
        </Link>
      </div>

      <RicePageHeader
        icon={Warehouse}
        title={t(`rice.kindGroup.${kind}` as MessageKey)}
        subtitle={t("rice.warehouse.detailSubtitle")}
      />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <article className={`${glassCard} px-5 py-5`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{t("common.quantity")}</p>
          <p className="mt-2 text-[22px] font-semibold text-navy">{formatKg(qty, locale)}</p>
        </article>
        <article className={`${glassCard} px-5 py-5`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{t("rice.finance.inventory")}</p>
          <p className="mt-2 text-[22px] font-semibold text-navy">{formatTzs(value)}</p>
        </article>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.warehouse.items")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.item")}</th>
                <th className="px-3 py-2">{t("rice.settings.code")}</th>
                <th className="px-3 py-2">{t("rice.settings.kind")}</th>
                <th className="px-3 py-2">{t("common.quantity")}</th>
                <th className="px-3 py-2">{t("common.value")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.warehouse.itemsEmpty")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{row.code}</td>
                    <td className="px-3 py-2.5">{t(`rice.kind.${row.kind}` as MessageKey)}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.valueTzs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                <th className="px-3 py-2">{t("rice.warehouse.source")}</th>
                <th className="px-3 py-2">{t("rice.warehouse.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    {t("rice.warehouse.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.itemName}</td>
                    <td className="px-3 py-2.5">{t(sourceKey(row.sourceType))}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {[row.sourceNumber, row.partyName].filter(Boolean).join(" · ") || "—"}
                    </td>
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
