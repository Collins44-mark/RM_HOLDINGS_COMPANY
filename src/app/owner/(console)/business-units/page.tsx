import Link from "next/link";
import { BusinessUnitCard } from "@/components/dashboard/BusinessUnitCard";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { BUSINESS_UNITS } from "@/lib/config/app";
import { prisma } from "@/lib/db";

export const metadata = { title: "Business Units" };

export default async function BusinessUnitsPage() {
  const units = await prisma.businessUnit.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true, transactions: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Units"
        description="RM Holdings operates these business units as one group. Open a unit to manage its operations."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BUSINESS_UNITS.map((unit) => {
          const record = units.find((item) => item.code === unit.code);
          return (
            <div key={unit.code} className="space-y-2">
              <BusinessUnitCard
                href={`/${unit.slug}`}
                code={unit.code}
                name={unit.name}
                location={unit.location}
                subtitle={unit.subtitle}
                accent={unit.accent}
                iconBg={unit.iconBg}
                surface={unit.surface}
              />
              <p className="px-1 text-[12px] text-slate-500">
                {record?._count.users ?? 0} assigned users · {record?._count.transactions ?? 0} finance records
              </p>
            </div>
          );
        })}
      </div>
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
