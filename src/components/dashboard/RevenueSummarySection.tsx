import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { UnitRevenue } from "@/lib/data/revenue";
import type { RevenuePeriod } from "@/lib/data/period";

export function RevenueSummarySection({
  items,
  total,
  period,
  label,
}: {
  items: UnitRevenue[];
  total: number;
  period: RevenuePeriod;
  label: string;
}) {
  return (
    <section>
      <SectionHeader
        title="Revenue Summary"
        description="Revenue by Business Unit"
        action={<PeriodFilter period={period} label={label} />}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
        {items.map((item) => (
          <RevenueCard
            key={item.code}
            code={item.code}
            name={item.name}
            amount={item.amount}
            accent={item.accent}
            tint={item.tint}
          />
        ))}
        <RevenueCard
          code="total"
          name="Total Revenue"
          amount={total}
          accent="#2f62c4"
          tint="#dce8fb"
          featured
        />
      </div>
    </section>
  );
}
