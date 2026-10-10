import { listSchoolStudentsAction } from "@/actions/school/students";
import { SchoolStudentsPage } from "@/components/school/SchoolStudentsPage";
import { parseSchoolPage, parseSchoolPageSize, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function SchoolStudentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; levelId?: string; classId?: string; streamId?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const pageSize = parseSchoolPageSize(params.pageSize);
  const result = await listSchoolStudentsAction({
    page: parseSchoolPage(params.page),
    pageSize,
    q: params.q,
    levelId: params.levelId,
    classId: params.classId,
    streamId: params.streamId,
  });
  return (
    <SchoolStudentsPage
      students={result.ok ? result.students : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0, pageSize)}
      levels={result.ok ? result.levels : []}
      query={params.q ?? ""}
      levelId={params.levelId ?? ""}
      classId={params.classId ?? ""}
      streamId={params.streamId ?? ""}
      pageSize={pageSize}
      canWithdraw={result.ok ? result.capabilities.canWithdraw : false}
      canTransfer={result.ok ? result.capabilities.canTransfer : false}
      error={result.ok ? null : result.error}
    />
  );
}
