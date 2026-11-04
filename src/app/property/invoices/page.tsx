import InvoicesView from "./invoices-view";
import { listInvoiceDirectory } from "@/lib/property/invoice-directory";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const directory = await listInvoiceDirectory();
  return <InvoicesView initialItems={directory.invoices} contracts={directory.contracts} />;
}
