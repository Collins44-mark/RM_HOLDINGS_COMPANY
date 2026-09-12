import { ProfileSettingsForm } from "@/components/profile/ProfileSettingsForm";
import { requireAuth } from "@/lib/auth/session";

export const metadata = { title: "Profile Settings" };

export default async function ProfileSettingsPage() {
  const user = await requireAuth();
  return <ProfileSettingsForm user={user} />;
}
