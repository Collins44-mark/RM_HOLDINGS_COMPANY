import { SupermarketSettingsPage } from "@/components/supermarket/SupermarketSettingsPage";
import { requireAuth } from "@/lib/auth/session";
import { isPlatformAdminRole, hasPermission } from "@/lib/auth/rbac";
import { identityFromUser } from "@/lib/auth/types";
import { getSupermarketReceiptDetails } from "@/lib/supermarket/store-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supermarket Settings" };

export default async function SupermarketSettingsRoute() {
  const user = await requireAuth();
  const identity = identityFromUser(user);
  const canEditPayments =
    isPlatformAdminRole(user.roleCode) ||
    hasPermission(identity, "supermarket.settings.manage") ||
    hasPermission(identity, "platform.settings.manage");
  const receipt = await getSupermarketReceiptDetails();
  return <SupermarketSettingsPage receipt={receipt} canEditPayments={canEditPayments} />;
}
