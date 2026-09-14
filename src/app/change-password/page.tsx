import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { requireAuth } from "@/lib/auth/session";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  await requireAuth();
  return <ChangePasswordForm />;
}
