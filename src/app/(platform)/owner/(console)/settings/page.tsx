import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { APP_MOTTO, APP_NAME, APP_TAGLINE, APP_TIMEZONE } from "@/lib/config/app";

export const metadata = { title: "System Settings" };

export default function SettingsPage() {
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
    </div>
  );
}
