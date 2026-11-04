import UnitsView from "./units-view";
import { listUnitDirectory } from "@/lib/property/unit-directory";

export const dynamic = "force-dynamic";

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const params = await searchParams;
  const directory = await listUnitDirectory();
  return (
    <UnitsView
      initialItems={directory.units}
      properties={directory.properties}
      propertyFromLink={typeof params.property === "string" ? params.property : ""}
    />
  );
}
