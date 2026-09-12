import Link from "next/link";
import { BusinessUnitCard } from "@/components/dashboard/BusinessUnitCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { UnitFinanceRow } from "@/lib/data/finance";

export function BusinessUnitsSection({ units }: { units: UnitFinanceRow[] }) {
  return (
    <section>
      <SectionHeader
        title="Business Units"
        description="Open a business module to manage its detailed operations."
        action={
          <Link
            href="/owner/business-units"
            className="text-[13.5px] font-medium text-accent hover:underline"
          >
            Manage Business Units →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
        {units.map((unit) => (
          <BusinessUnitCard
            key={unit.code}
            href={unit.moduleHref}
            code={unit.code}
            name={unit.name}
            location={unit.location}
            subtitle={unit.subtitle}
            accent={unit.accent}
            iconBg={unit.tint}
          />
        ))}
      </div>
    </section>
  );
}
