import { BusinessUnitLocationsForm } from "@/components/settings/BusinessUnitLocationsForm";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { APP_MOTTO, APP_NAME, APP_TAGLINE, APP_TIMEZONE } from "@/lib/config/app";
import { listBusinessUnits } from "@/lib/data/business-units";

export const metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const user = await requireAuth();
  const canEditLocations = isOwnerRole(user.roleCode);
  const units = canEditLocations ? await listBusinessUnits() : [];

  const rows = [
    ["Organisation", APP_NAME],
    ["Tagline", APP_TAGLINE],
    ["Motto", APP_MOTTO],
    ["Timezone", APP_TIMEZONE],
    ["Currency", "TZS"],
    ["Authentication", "Central session, module-scoped authorisation"],
    ["Database", "Single shared database for all business units"],
  ];

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Platform administration for RM Holdings. System information belongs here, not on the main dashboard."
      />
      <Surface>
        <dl>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-1 gap-1 border-b border-black/4 px-5 py-3.5 last:border-0 sm:grid-cols-[220px_1fr] sm:gap-6"
            >
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-sm font-medium text-navy">{value}</dd>
            </div>
          ))}
        </dl>
      </Surface>
      {canEditLocations ? (
        <div className="mt-6">
          <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.02em] text-navy">
            Business Unit Locations
          </h2>
          <Surface>
            <BusinessUnitLocationsForm
              units={units.map((unit) => ({
                id: unit.id,
                name: unit.name,
                storedLocation: unit.storedLocation,
              }))}
            />
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
