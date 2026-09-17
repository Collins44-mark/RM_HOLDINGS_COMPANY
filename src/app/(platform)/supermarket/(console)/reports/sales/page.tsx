import { Suspense } from "react";
import { SalesReportDetail } from "@/components/supermarket/SalesReportDetail";

export const metadata = { title: "Sales Report" };

export default function SupermarketSalesReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <SalesReportDetail />
    </Suspense>
  );
}
