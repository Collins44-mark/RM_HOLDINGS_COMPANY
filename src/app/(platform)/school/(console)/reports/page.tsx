import { loadSchoolReportsWorkspaceAction } from "@/actions/school/reports";
import { SchoolReportsPage } from "@/components/school/SchoolReportsPage";
import { parseSchoolReportKind } from "@/lib/school/report-types";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function SchoolReportsRoute({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; period?: string; from?: string; to?: string; slice?: string }>;
}) {
  const params = await searchParams;
  const initial = await loadSchoolReportsWorkspaceAction({
    kind: parseSchoolReportKind(params.report) ?? undefined,
    period: params.period,
    from: params.from,
    to: params.to,
    slice: params.slice,
  });
  return <SchoolReportsPage initial={initial} />;
}
