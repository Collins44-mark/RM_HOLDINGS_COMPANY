import { listSchoolAdmissionsAction } from "@/actions/school/admissions";
import { SchoolAdmissionsPage } from "@/components/school/SchoolAdmissionsPage";
import { schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

export default async function SchoolAdmissionsRoute() {
  const result = await listSchoolAdmissionsAction();
  return (
    <SchoolAdmissionsPage
      admissions={result.ok ? result.admissions : result.admissions ?? []}
      page={result.ok ? result.page : result.page ?? schoolPageMeta(1, 0)}
      canManage={result.capabilities?.canManage ?? false}
      query=""
      status="all"
      error={result.ok ? null : result.error}
    />
  );
}
