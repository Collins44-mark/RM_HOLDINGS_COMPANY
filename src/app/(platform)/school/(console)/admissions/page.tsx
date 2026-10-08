import { listSchoolAdmissionsAction } from "@/actions/school/admissions";
import { SchoolAdmissionsPage } from "@/components/school/SchoolAdmissionsPage";
import { parseSchoolPage, parseSchoolPageSize, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

export default async function SchoolAdmissionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const pageSize = parseSchoolPageSize(params.pageSize);
  const result = await listSchoolAdmissionsAction({
    page: parseSchoolPage(params.page),
    pageSize,
    q: params.q,
    status: params.status,
  });
  return (
    <SchoolAdmissionsPage
      admissions={result.ok ? result.admissions : result.admissions ?? []}
      page={result.ok ? result.page : result.page ?? schoolPageMeta(1, 0, pageSize)}
      canManage={result.capabilities?.canManage ?? false}
      query={params.q ?? ""}
      status={params.status ?? "all"}
      error={result.ok ? null : result.error}
    />
  );
}
