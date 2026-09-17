import { Suspense } from "react";
import { ProfitLossReportDetail } from "@/components/supermarket/ProfitLossReportDetail";

export const metadata = { title: "Profit & Loss" };

export default function SupermarketProfitLossReportRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <ProfitLossReportDetail />
    </Suspense>
  );
}
