"use client";

import { usePathname } from "next/navigation";
import { ConsoleLoading } from "@/components/layout/ConsoleLoading";
import { RiceOverviewPage } from "@/components/rice/RiceOverviewPage";

export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/rice") {
    return <RiceOverviewPage overview={null} period="this-month" periodLabel="This Month" error={null} pending />;
  }
  return <ConsoleLoading />;
}
