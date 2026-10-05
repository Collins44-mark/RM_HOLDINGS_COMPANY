"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { saveBusinessUnitLocationAction } from "@/actions/business-units";
import { NavGlyph } from "@/components/icons/nav-icons";
import { useT } from "@/components/i18n/LocaleProvider";
import { navIconForCode } from "@/lib/data/business-units";

type UnitOption = {
  id: string;
  code: string;
  name: string;
  storedLocation: string;
};

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10 disabled:cursor-not-allowed disabled:bg-slate-50";

function LocationRow({
  unit,
  canEdit,
}: {
  unit: UnitOption;
  canEdit: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveBusinessUnitLocationAction, null);
  const [value, setValue] = useState(unit.storedLocation);
  const [committed, setCommitted] = useState(unit.storedLocation);
  const [, startTransition] = useTransition();

  function submitIfChanged(next = value) {
    if (!canEdit || next.trim() === committed.trim()) return;
    const form = new FormData();
    form.set("businessUnitId", unit.id);
    form.set("location", next);
    startTransition(() => {
      action(form);
      setCommitted(next);
    });
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        submitIfChanged();
      }}
      className="grid grid-cols-1 items-center gap-2 border-b border-black/[0.04] py-3 last:border-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-6"
    >
      <input type="hidden" name="businessUnitId" value={unit.id} />
      <div className="flex min-w-0 items-center gap-2.5">
        <NavGlyph
          name={navIconForCode(unit.code)}
          className="h-[18px] w-[18px] shrink-0 text-navy/55"
        />
        <span className="truncate text-[14px] font-medium text-navy">{unit.name}</span>
      </div>
      <div className="min-w-0">
        <input
          name="location"
          value={value}
          disabled={!canEdit || pending}
          maxLength={160}
          placeholder={t("settings.locationPlaceholder")}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => submitIfChanged()}
          className={fieldClass}
        />
        {state?.error ? (
          <p className="mt-1 text-xs text-rose-600">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}

export function BusinessUnitLocationsForm({
  units,
  canEdit,
}: {
  units: UnitOption[];
  canEdit: boolean;
}) {
  const t = useT();
  const rows = useMemo(() => units, [units]);

  return (
    <section className="rounded-[24px] border border-white/70 bg-white/72 shadow-[0_10px_30px_rgba(15,35,64,0.06)] backdrop-blur-xl">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex text-navy/70">
            <MapPin className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">
              {t("settings.locationsTitle")}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              {t("settings.locationsSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 px-0 pb-2 sm:grid">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {t("settings.column.businessUnit")}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {t("settings.column.location")}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">{t("settings.unitsEmpty")}</p>
        ) : (
          <div>
            {rows.map((unit) => (
              <LocationRow key={unit.id} unit={unit} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
