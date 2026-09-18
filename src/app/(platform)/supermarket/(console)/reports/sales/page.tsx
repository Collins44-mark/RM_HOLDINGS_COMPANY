import { Suspense } from "react";
import { SalesReportDetail } from "@/components/supermarket/SalesReportDetail";
import ReportsLoading from "../loading";

export const metadata = { title: "Sales Report" };

export default function SupermarketSalesReportRoute() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <SalesReportDetail />
    </Suspense>
  );
}
