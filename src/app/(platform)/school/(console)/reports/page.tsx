import { loadSchoolReportsWorkspaceAction } from "@/actions/school/reports";
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
  const kind = parseSchoolReportKind(raw);
  const initial = kind ? await loadSchoolReportsWorkspaceAction({ kind }) : null;
  return <SchoolReportsPage initial={initial} initialKind={kind} />;
}
