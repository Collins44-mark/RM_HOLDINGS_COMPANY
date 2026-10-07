import { getSchoolAdmissionAction } from "@/actions/school/admissions";
import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";

export const metadata = { title: "Admission" };

export default async function SchoolAdmissionDetailRoute({
  params,
}: {
  params: Promise<{ admissionId: string }>;
}) {
  const { admissionId } = await params;
  const result = await getSchoolAdmissionAction(admissionId);
  return (
    <SchoolAdmissionDetailPage
      admission={result.ok ? result.admission : null}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
