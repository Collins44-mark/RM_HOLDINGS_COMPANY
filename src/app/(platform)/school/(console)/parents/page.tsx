import { listSchoolGuardiansAction } from "@/actions/school/parents";
import { SchoolParentsPage } from "@/components/school/SchoolParentsPage";
import { schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Parents / Guardians" };
export const dynamic = "force-dynamic";

export default async function SchoolParentsRoute() {
  const result = await listSchoolGuardiansAction();
  return (
    <SchoolParentsPage
      guardians={result.ok ? result.guardians : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      levels={result.ok ? result.levels : []}
      classes={result.ok ? result.classes : []}
      streams={result.ok ? result.streams : []}
      query=""
      levelId=""
      classId=""
      streamId=""
      pageSize={result.ok ? result.page.pageSize : 20}
      error={result.ok ? null : result.error}
    />
  );
}
