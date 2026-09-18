import { Suspense } from "react";
import { InventoryReportDetail } from "@/components/supermarket/InventoryReportDetail";
import ReportsLoading from "../loading";

export const metadata = { title: "Inventory Report" };

export default function SupermarketInventoryReportRoute() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <InventoryReportDetail />
    </Suspense>
  );
}
