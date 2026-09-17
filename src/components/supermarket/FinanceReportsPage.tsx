import Link from "next/link";
import { BarChart3, Boxes, ShoppingBag, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { FinanceBackLink } from "@/components/supermarket/FinanceBackLink";

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

const REPORT_LINKS = [
  {
    href: "/supermarket/reports/sales",
    title: "Sales Reports",
    description: "Daily and period sales performance.",
    icon: TrendingUp,
    tone: "border-emerald-200/35 bg-emerald-50/40",
    iconTone: "border-emerald-200/50 bg-white/70 text-emerald-600",
  },
  {
    href: "/supermarket/reports/inventory",
    title: "Inventory Reports",
    description: "Stock levels, movement, and valuation.",
    icon: Boxes,
    tone: "border-sky-200/35 bg-sky-50/40",
    iconTone: "border-sky-200/50 bg-white/70 text-sky-600",
  },
  {
    href: "/supermarket/reports/purchases",
    title: "Purchase Reports",
    description: "Supplier purchases and order history.",
    icon: ShoppingBag,
    tone: "border-amber-200/35 bg-amber-50/40",
    iconTone: "border-amber-200/50 bg-white/70 text-amber-600",
  },
  {
    href: "/supermarket/reports/profit-loss",
    title: "Profit & Loss",
    description: "Income, expenses, and net results.",
    icon: BarChart3,
    tone: "border-violet-200/35 bg-violet-50/40",
    iconTone: "border-violet-200/50 bg-white/70 text-violet-600",
  },
] as const;

export function FinanceReportsPage() {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <div>
        <FinanceBackLink />
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Reports</h1>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          Explore detailed supermarket financial and operational reports.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORT_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(glass, "flex items-start gap-3 px-4 py-4 transition hover:bg-white/70 sm:px-5 sm:py-5", item.tone)}
            >
              <span
                className={cn(
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)]",
                  item.iconTone,
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold tracking-[-0.02em] text-navy">{item.title}</span>
                <span className="mt-1 block text-[12.5px] leading-5 text-slate-500">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
