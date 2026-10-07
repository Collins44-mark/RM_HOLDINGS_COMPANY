import { listSchoolStudentsAction } from "@/actions/school/students";
import { SchoolStudentsPage } from "@/components/school/SchoolStudentsPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Students" };

export default async function SchoolStudentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const result = await listSchoolStudentsAction({ page: parseSchoolPage(params.page), q: params.q });
  return (
    <SchoolStudentsPage
      students={result.ok ? result.students : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      query={params.q ?? ""}
      error={result.ok ? null : result.error}
    />
  );
}
