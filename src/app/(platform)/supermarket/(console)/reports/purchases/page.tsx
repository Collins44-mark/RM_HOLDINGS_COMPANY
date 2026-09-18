import { Suspense } from "react";
import { PurchaseReportDetail } from "@/components/supermarket/PurchaseReportDetail";
import ReportsLoading from "../loading";

export const metadata = { title: "Purchase Report" };

export default function SupermarketPurchaseReportRoute() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <PurchaseReportDetail />
    </Suspense>
  );
}
