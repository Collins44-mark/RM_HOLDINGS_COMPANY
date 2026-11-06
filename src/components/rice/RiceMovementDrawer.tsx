"use client";

import { ContainedDrawer } from "@/components/ui/ContainedDrawer";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import type { RiceStockMovement, RiceWarehouseMovement } from "@/lib/rice/types";
import { formatKg, formatRiceDate, riceWarehouseSourceKey } from "@/components/rice/rice-ui";

function isWarehouseMovement(row: RiceStockMovement): row is RiceWarehouseMovement {
  return "sourceNumber" in row;
}

export function RiceMovementDrawer({
  movement,
  onClose,
}: {
  movement: RiceStockMovement;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const detail = isWarehouseMovement(movement) ? movement : null;
  const source = [detail?.sourceNumber, detail?.partyName].filter(Boolean).join(" · ");
  const facts = [
    [t("rice.milling.filterDate"), formatRiceDate(movement.occurredOn)],
    [t("common.item"), movement.itemName],
    [t("common.type"), t(riceWarehouseSourceKey(movement.sourceType))],
    [t("common.quantity"), formatKg(movement.qtyKg, locale)],
    ...(detail?.itemCode ? [[t("rice.settings.code"), detail.itemCode]] : []),
    ...(source ? [[t("rice.warehouse.source"), source]] : []),
    [t("rice.warehouse.reason"), movement.notes || "—"],
  ];
  return (
    <ContainedDrawer title={movement.itemName} subtitle={t("rice.warehouse.details")} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#f4f7fb] px-3 py-3">
            <dt className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
    </ContainedDrawer>
  );
}
