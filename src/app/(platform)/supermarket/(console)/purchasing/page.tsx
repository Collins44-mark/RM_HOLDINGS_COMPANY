import { Suspense } from "react";
import { PurchasingManager } from "@/components/supermarket/PurchasingManager";

export const metadata = { title: "Purchasing" };

export default function SupermarketPurchasingPage() {
  return (
    <Suspense fallback={null}>
      <PurchasingManager />
    </Suspense>
  );
}
