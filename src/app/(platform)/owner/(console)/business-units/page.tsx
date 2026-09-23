import Link from "next/link";
import { BusinessUnitCard } from "@/components/dashboard/BusinessUnitCard";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { listBusinessUnits } from "@/lib/data/business-units";

export const metadata = { title: "Business Units" };

export default async function BusinessUnitsPage() {
  const units = await listBusinessUnits();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Units"
        description="RM Holdings operates these business units as one group. Open a unit to manage its operations when the module is connected."
      />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
        {units.map((unit) => (
          <div key={unit.id} className="space-y-2">
            <BusinessUnitCard
              href={unit.moduleHref}
              code={unit.code}
              name={unit.name}
              location={unit.location}
              subtitle={unit.subtitle}
              accent={unit.accent}
              iconBg={unit.iconBg}
              surface={unit.surface}
            />
            <div className="space-y-0.5 px-1 text-[12px] text-slate-500">
              <p>
                Status:{" "}
                <span className={unit.isActive ? "font-medium text-emerald-700" : "font-medium text-slate-600"}>
                  {unit.isActive ? "Active" : "Inactive"}
                </span>
                {" · "}
                {unit.assignedUserCount} assigned user{unit.assignedUserCount === 1 ? "" : "s"}
              </p>
              <p>
                {unit.hasOperationalModule
                  ? "Live operational module connected"
                  : "Module not yet connected · no live operational data"}
              </p>
            </div>
          </div>
        ))}
      </div>
      {units.length === 0 ? (
        <Surface className="px-5 py-4 text-sm leading-6 text-slate-500">
          No business units were returned from Supabase. Confirm `business_units` is configured and
          accessible.
        </Surface>
      ) : null}
      <Surface className="px-5 py-4 text-sm leading-6 text-slate-500">
        School transport, including buses, drivers, routes, fuel and maintenance, is managed inside{" "}
        <Link href="/school/transport/buses" className="font-medium text-[#2f6fed]">
          School Management
        </Link>
        . It is not a separate group-level business module.
      </Surface>
    </div>
  );
}
