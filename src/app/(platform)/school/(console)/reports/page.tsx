import { SchoolReportsPage } from "@/components/school/SchoolReportsPage";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default function SchoolReportsRoute() {
  return <SchoolReportsPage initial={null} />;
}
