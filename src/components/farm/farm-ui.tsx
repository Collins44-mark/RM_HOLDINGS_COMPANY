import type { ReactNode } from "react";
import { SchoolField, SchoolIconWell } from "@/components/school/school-ui";
import { glassCard } from "@/components/supermarket/purchasing-ui";
import { OverviewPeriodSelector } from "@/components/dashboard/OverviewPeriodSelector";
import { cn } from "@/lib/cn";
import type { ReportPeriod } from "@/lib/data/report-period";
import type { LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function farmMethodKey(value: string): MessageKey {
  if (value === "CASH" || value === "MOBILE_MONEY" || value === "BANK" || value === "CREDIT") {
    return `rice.method.${value}`;
  }
  return "rice.method.CASH";
}

export const FARM_METHODS = [
  { value: "CASH" },
  { value: "MOBILE_MONEY" },
  { value: "BANK" },
] as const;

export function FarmPageHeader({
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

export const FarmField = SchoolField;

export function FarmNotice({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-[#c45b66]">{children}</p>;
}

export function farmTractorStatusKey(status: string): MessageKey {
  if (status === "IN_USE") return "farm.status.inUse";
  if (status === "UNDER_SERVICE") return "farm.status.service";
  if (status === "INACTIVE") return "farm.status.inactive";
  return "farm.status.available";
}

export function farmJobStatusKey(status: string): MessageKey {
  if (status === "IN_PROGRESS") return "farm.job.inProgress";
  if (status === "COMPLETED") return "farm.job.completed";
  if (status === "CANCELLED") return "farm.job.cancelled";
  return "farm.job.pending";
}
