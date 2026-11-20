import { PosManager } from "@/components/supermarket/PosManager";
import { getSupermarketReceiptDetails } from "@/lib/supermarket/store-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "POS / New Sale" };

export default async function SupermarketPosPage() {
  const receipt = await getSupermarketReceiptDetails();
  return <PosManager receipt={receipt} />;
}
