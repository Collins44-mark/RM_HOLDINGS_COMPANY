import TenantsView from "./tenants-view";
import { listTenantDirectory } from "@/lib/property/tenants";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const directory = await listTenantDirectory();
  return <TenantsView initialItems={directory.tenants} properties={directory.properties} units={directory.units} />;
}
