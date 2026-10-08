import { listSchoolGuardiansAction } from "@/actions/school/parents";
import { SchoolParentsPage } from "@/components/school/SchoolParentsPage";
import { parseSchoolPage, parseSchoolPageSize, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Parents / Guardians" };
export const dynamic = "force-dynamic";

export default async function SchoolParentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; levelId?: string; classId?: string; streamId?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const pageSize = parseSchoolPageSize(params.pageSize);
  const result = await listSchoolGuardiansAction({
    page: parseSchoolPage(params.page),
    pageSize,
    q: params.q,
    levelId: params.levelId,
    classId: params.classId,
    streamId: params.streamId,
  });
  return (
    <SchoolParentsPage
      guardians={result.ok ? result.guardians : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0, pageSize)}
      levels={result.ok ? result.levels : []}
      query={params.q ?? ""}
      levelId={params.levelId ?? ""}
      classId={params.classId ?? ""}
      streamId={params.streamId ?? ""}
      pageSize={pageSize}
      error={result.ok ? null : result.error}
    />
  );
}
