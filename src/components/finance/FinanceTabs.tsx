"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, PieChart, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FinanceTab } from "@/lib/data/finance";

const TABS: { id: FinanceTab; label: string; icon: typeof Building2 }[] = [
  { id: "units", label: "By Business Unit", icon: Building2 },
  { id: "trend", label: "Trend Analysis", icon: TrendingUp },
  { id: "category", label: "Category Breakdown", icon: PieChart },
];

export function FinanceTabs({ active }: { active: FinanceTab }) {
  const searchParams = useSearchParams();

  function hrefFor(tab: FinanceTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "units") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    return query ? `/owner/finance?${query}` : "/owner/finance";
  }

  return (
    <nav aria-label="Finance views" className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition duration-200",
              isActive
                ? "bg-nav-active text-white shadow-[0_6px_16px_rgba(58,111,212,0.18)]"
                : "bg-white text-slate-600 ring-1 ring-black/6 hover:text-navy",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.9} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
