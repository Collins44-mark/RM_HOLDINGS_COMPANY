import { Suspense } from "react";
import { PurchaseReportDetail } from "@/components/supermarket/PurchaseReportDetail";

export const metadata = { title: "Purchase Report" };

export default function SupermarketPurchaseReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <PurchaseReportDetail />
    </Suspense>
  );
}
