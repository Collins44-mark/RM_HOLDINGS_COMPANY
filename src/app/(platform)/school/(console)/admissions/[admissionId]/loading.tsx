import { SchoolAdmissionDetailPage } from "@/components/school/SchoolAdmissionDetailPage";

export default function AdmissionDetailLoading() {
  return <SchoolAdmissionDetailPage admission={null} canManage={false} error={null} pending />;
}
