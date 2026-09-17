import { Suspense } from "react";
import { InventoryReportPage } from "@/components/supermarket/ReportsCenter";

export const metadata = { title: "Inventory Report" };

export default function SupermarketInventoryReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <InventoryReportPage />
    </Suspense>
  );
}
