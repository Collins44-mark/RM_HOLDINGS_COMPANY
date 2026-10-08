import { SchoolAdmissionDetailClient } from "@/components/school/SchoolAdmissionDetailClient";

export const metadata = { title: "Admission" };

export default async function SchoolAdmissionDetailRoute({
  params,
}: {
  params: Promise<{ admissionId: string }>;
}) {
  const { admissionId } = await params;
  return <SchoolAdmissionDetailClient admissionId={admissionId} />;
}
