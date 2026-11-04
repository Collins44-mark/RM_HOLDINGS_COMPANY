import ContractsView from "./contracts-view";
import { listContractDirectory } from "@/lib/property/contract-directory";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const directory = await listContractDirectory();
  return (
    <ContractsView
      initialItems={directory.contracts}
      tenants={directory.tenants}
      properties={directory.properties}
      units={directory.units}
    />
  );
}
