import { BusinessUnitCard } from "@/components/dashboard/BusinessUnitCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getConsolidatedFinance } from "@/lib/data/finance";
import { parsePeriod } from "@/lib/data/period";
import { requireAuth } from "@/lib/auth/session";

export const metadata = { title: "Your workspaces" };

export default async function WorkspacePage() {
  const user = await requireAuth();
  const finance = await getConsolidatedFinance({ period: parsePeriod(undefined) });
  const units = finance.rows.filter((row) => user.modules.includes(row.code));

  return (
    <section>
      <SectionHeader
        title="Business Units"
        description="Open a business module to manage its detailed operations."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
