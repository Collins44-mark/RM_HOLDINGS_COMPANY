import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { BusinessUnitLocationsForm } from "@/components/settings/BusinessUnitLocationsForm";
import { MobileMoneyProvidersForm } from "@/components/settings/MobileMoneyProvidersForm";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { listBusinessUnitLocationRows } from "@/lib/data/business-units";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { getTranslator } from "@/lib/i18n/server";

export const metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const [user, t] = await Promise.all([requireAuth(), getTranslator()]);
  const canEdit = isOwnerRole(user.roleCode);
  const [settings, units] = await Promise.all([
    getOrganizationSettings(),
    listBusinessUnitLocationRows(),
  ]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-navy sm:text-[22px]">
          {t("settings.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-slate-500 sm:text-[13.5px]">
          {t("settings.subtitle")}
        </p>
      </div>
      <GeneralSettingsForm settings={settings} canEdit={canEdit} />
      <BusinessUnitLocationsForm units={units} canEdit={canEdit} />
      <MobileMoneyProvidersForm canEdit={canEdit} />
    </div>
  );
}
