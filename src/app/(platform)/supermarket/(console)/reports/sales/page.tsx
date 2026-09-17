import { Suspense } from "react";
import { SalesReportPage } from "@/components/supermarket/ReportsCenter";

export const metadata = { title: "Sales Report" };

export default function SupermarketSalesReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <SalesReportPage />
    </Suspense>
  );
}
