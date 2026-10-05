import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { hydrateRuntimeSettings } from "@/lib/config/runtime-settings";
import { htmlLang } from "@/lib/i18n";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RM Holdings Ltd",
    template: "%s · RM Holdings Ltd",
  },
  description:
    "RM Holdings Management System — one platform for agriculture, education, trade and investments.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await getOrganizationSettings();
  hydrateRuntimeSettings(settings);

  return (
    <html
      lang={htmlLang(settings.language)}
      className={`${inter.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas font-sans text-navy">
        <LocaleProvider
          locale={settings.language}
          organisationName={settings.organisationName}
          timezone={settings.timezone}
          currency={settings.currency}
        >
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
