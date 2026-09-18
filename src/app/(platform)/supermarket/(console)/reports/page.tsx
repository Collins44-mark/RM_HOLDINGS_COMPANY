import { Suspense } from "react";
import { ReportsCenter } from "@/components/supermarket/ReportsCenter";
import ReportsLoading from "./loading";

export const metadata = { title: "Reports" };

export default function SupermarketReportsPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReportsCenter />
    </Suspense>
  );
}
