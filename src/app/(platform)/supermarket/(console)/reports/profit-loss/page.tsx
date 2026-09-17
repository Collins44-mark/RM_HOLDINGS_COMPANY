import { Suspense } from "react";
import { ProfitLossReportPage } from "@/components/supermarket/ReportsCenter";

export const metadata = { title: "Profit & Loss" };

export default function SupermarketProfitLossReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <ProfitLossReportPage />
    </Suspense>
  );
}
