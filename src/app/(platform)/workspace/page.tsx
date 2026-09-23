import { BusinessUnitCard } from "@/components/dashboard/BusinessUnitCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { listAccessibleBusinessUnits } from "@/lib/data/business-units";
import { requireAuth } from "@/lib/auth/session";
import { identityFromUser } from "@/lib/auth/types";

export const metadata = { title: "Your workspaces" };

export default async function WorkspacePage() {
  const user = await requireAuth();
  const units = await listAccessibleBusinessUnits(identityFromUser(user));

  return (
    <section>
      <SectionHeader
        title="Business Units"
        description="Open a business module to manage its detailed operations."
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
