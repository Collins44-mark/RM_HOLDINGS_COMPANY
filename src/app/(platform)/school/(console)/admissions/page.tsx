import { listSchoolAdmissionsAction } from "@/actions/school/admissions";
import { SchoolAdmissionsPage } from "@/components/school/SchoolAdmissionsPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

export default async function SchoolAdmissionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const result = await listSchoolAdmissionsAction({
    page: parseSchoolPage(params.page),
    q: params.q,
    status: params.status,
  });
  return (
    <SchoolAdmissionsPage
      admissions={result.ok ? result.admissions : result.admissions ?? []}
      page={result.ok ? result.page : result.page ?? schoolPageMeta(1, 0)}
      canManage={result.capabilities?.canManage ?? false}
      query={params.q ?? ""}
      status={params.status ?? "all"}
      error={result.ok ? null : result.error}
    />
  );
}
