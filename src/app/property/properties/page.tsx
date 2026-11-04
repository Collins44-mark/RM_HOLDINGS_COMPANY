import PropertiesView from "./properties-view";
import { listProperties } from "@/lib/property/dashboard-counts";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const items = await listProperties();
  return <PropertiesView initialItems={items} />;
}
