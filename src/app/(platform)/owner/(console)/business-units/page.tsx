import { BusinessUnitOverviewCard } from "@/components/dashboard/BusinessUnitOverviewCard";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { listBusinessUnits } from "@/lib/data/business-units";
import { getTranslator } from "@/lib/i18n/server";

export const metadata = { title: "Business Units" };

export default async function BusinessUnitsPage() {
  const [units, t] = await Promise.all([listBusinessUnits(), getTranslator()]);

  return (
    <div>
      <PageHeader
        title={t("dashboard.businessUnits")}
        description={t("dashboard.businessUnitsDescription")}
      />
      {units.length === 0 ? (
        <Surface className="px-5 py-4 text-sm leading-6 text-slate-500">
          {t("dashboard.unitsEmpty")}
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <BusinessUnitOverviewCard
              key={unit.id}
              href={unit.moduleHref}
              code={unit.code}
              name={unit.name}
              location={unit.location}
              accent={unit.accent}
              iconBg={unit.iconBg}
            />
          ))}
        </div>
      )}
    </div>
  );
}
