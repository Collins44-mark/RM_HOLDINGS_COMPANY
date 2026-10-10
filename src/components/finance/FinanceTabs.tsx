"use client";

import { Banknote, Building2, PieChart, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/components/i18n/LocaleProvider";
import type { FinanceTab } from "@/lib/data/finance";

export function FinanceTabs({
  active,
  onChange,
}: {
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
}) {
  const t = useT();
  const tabs: { id: FinanceTab; label: string; icon: typeof Building2 }[] = [
    { id: "units", label: t("finance.tab.units"), icon: Building2 },
    { id: "trend", label: t("finance.tab.trend"), icon: TrendingUp },
    { id: "category", label: t("finance.tab.category"), icon: PieChart },
    { id: "salary", label: t("finance.tab.salary"), icon: Banknote },
  ];
  return (
    <nav aria-label="Finance views" className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition duration-200",
              isActive
                ? "bg-nav-active text-white shadow-[0_6px_16px_rgba(58,111,212,0.18)]"
                : "bg-white text-slate-600 ring-1 ring-black/6 hover:text-navy",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.9} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
