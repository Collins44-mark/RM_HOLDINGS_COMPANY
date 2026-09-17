import { Suspense } from "react";
import { ReportsCenter } from "@/components/supermarket/ReportsCenter";

export const metadata = { title: "Reports" };

export default function SupermarketReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <ReportsCenter />
    </Suspense>
  );
}
