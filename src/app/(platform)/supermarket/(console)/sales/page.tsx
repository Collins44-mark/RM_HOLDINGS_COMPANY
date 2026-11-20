import { SalesManager } from "@/components/supermarket/SalesManager";
import { getSupermarketReceiptDetails } from "@/lib/supermarket/store-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales" };

export default async function SupermarketSalesPage() {
  const receipt = await getSupermarketReceiptDetails();
  return <SalesManager receipt={receipt} />;
}
