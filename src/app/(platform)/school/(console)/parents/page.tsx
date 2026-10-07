import { listSchoolGuardiansAction } from "@/actions/school/parents";
import { SchoolParentsPage } from "@/components/school/SchoolParentsPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Parents / Guardians" };

export default async function SchoolParentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const result = await listSchoolGuardiansAction({ page: parseSchoolPage(params.page), q: params.q });
  return (
    <SchoolParentsPage
      guardians={result.ok ? result.guardians : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      query={params.q ?? ""}
      error={result.ok ? null : result.error}
    />
  );
}
