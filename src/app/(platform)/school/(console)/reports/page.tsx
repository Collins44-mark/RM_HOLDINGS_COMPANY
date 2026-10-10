import { SchoolReportsPage } from "@/components/school/SchoolReportsPage";
import { parseSchoolReportKind } from "@/lib/school/report-types";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function SchoolReportsRoute({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: raw } = await searchParams;
  return <SchoolReportsPage initial={null} initialKind={parseSchoolReportKind(raw)} />;
}
