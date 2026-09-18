import { Suspense } from "react";
import { ProfitLossReportDetail } from "@/components/supermarket/ProfitLossReportDetail";
import ReportsLoading from "../loading";

export const metadata = { title: "Profit & Loss" };

export default function SupermarketProfitLossReportRoute() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ProfitLossReportDetail />
    </Suspense>
  );
}
