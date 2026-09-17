import { Suspense } from "react";
import { InventoryReportDetail } from "@/components/supermarket/InventoryReportDetail";

export const metadata = { title: "Inventory Report" };

export default function SupermarketInventoryReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <InventoryReportDetail />
    </Suspense>
  );
}
