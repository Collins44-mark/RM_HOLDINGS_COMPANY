import type { ReactNode } from "react";
import { SchoolField, SchoolIconWell } from "@/components/school/school-ui";
import { glassCard } from "@/components/supermarket/purchasing-ui";
import { OverviewPeriodSelector } from "@/components/dashboard/OverviewPeriodSelector";
import { cn } from "@/lib/cn";
import type { ReportPeriod } from "@/lib/data/report-period";
import type { LucideIcon } from "lucide-react";
import type { Locale, MessageKey } from "@/lib/i18n";

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatKg(value: number, locale: Locale = "en") {
  const formatted = new Intl.NumberFormat(locale === "sw" ? "sw-TZ" : "en-TZ", { maximumFractionDigits: 2 }).format(value);
  return `${formatted} kg`;
}

export function riceMethodKey(value: string): MessageKey {
  if (value === "CASH" || value === "MOBILE_MONEY" || value === "BANK" || value === "CREDIT") {
    return `rice.method.${value}`;
  }
  return "rice.method.CASH";
}

export function riceKindKey(value: string): MessageKey {
  if (value === "PADDY" || value === "RICE" || value === "BROKEN" || value === "BYPRODUCT") {
    return `rice.kind.${value}`;
  }
  return "common.type";
}

export function riceFeeKindKey(value: string): MessageKey {
  if (value === "STORAGE" || value === "MILLING" || value === "GRADING" || value === "HANDLING") {
    return `rice.storage.fee.${value}`;
  }
  return "common.type";
}

export function riceExpenseKindKey(value: string): MessageKey {
  if (value === "OPERATING" || value === "UTILITIES" || value === "LABOUR" || value === "MILLING" || value === "OTHER") {
    return `rice.finance.expense.${value}`;
  }
  return "common.type";
}

export function riceMoveTypeKey(value: string): MessageKey {
  return value === "RELEASE" ? "rice.storage.release" : "rice.storage.deposit";
}

export function riceWarehouseSourceKey(type: string): MessageKey {
  if (type === "PURCHASE") return "rice.warehouse.source.purchase";
  if (type === "MILL_IN") return "rice.warehouse.source.millIn";
  if (type === "MILL_OUT") return "rice.warehouse.source.millOut";
  if (type === "SALE") return "rice.warehouse.source.sale";
  if (type === "ADJUST") return "rice.warehouse.source.adjust";
  return "common.type";
}

export const RICE_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "BANK", label: "Bank" },
  { value: "CREDIT", label: "On account" },
] as const;

export function RicePageHeader({
  icon: Icon,
  title,
  subtitle,
  period,
  periodLabel,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  period?: ReportPeriod;
  periodLabel?: string;
}) {
  return (
    <header className={cn(glassCard, "flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6")}>
      <div className="flex min-w-0 items-start gap-3">
        <SchoolIconWell icon={Icon} />
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.04em] text-navy">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13.5px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {period && periodLabel ? <OverviewPeriodSelector period={period} label={periodLabel} /> : null}
    </header>
  );
}

export const RiceField = SchoolField;

export function RiceNotice({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-[#c45b66]">{children}</p>;
}
