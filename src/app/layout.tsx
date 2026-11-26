import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { hydrateRuntimeSettings } from "@/lib/config/runtime-settings";
import { htmlLang } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: {
    default: "RM Holdings Ltd",
    template: "%s · RM Holdings Ltd",
  },
  description:
    "RM Holdings Management System — one platform for agriculture, education, trade and investments.",
  manifest: "/manifest.webmanifest",
  applicationName: "RM Holdings Ltd",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await getOrganizationSettings();
  hydrateRuntimeSettings(settings);
  const locale = await resolveRequestLocale(settings.language);

  return (
    <html
      lang={htmlLang(locale)}
      className="h-full antialiased"
    >
      <body className="min-h-full bg-canvas font-sans text-navy">
        <LocaleProvider
          locale={locale}
          organisationName={settings.organisationName}
          logoUrl={settings.logoUrl}
          timezone={settings.timezone}
          currency={settings.currency}
        >
          <ServiceWorkerRegister />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
