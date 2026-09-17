import { Suspense } from "react";
import { PurchaseReportPage } from "@/components/supermarket/ReportsCenter";

export const metadata = { title: "Purchase Report" };

export default function SupermarketPurchaseReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <PurchaseReportPage />
    </Suspense>
  );
}
