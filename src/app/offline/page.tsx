import Link from "next/link";
import { DEFAULT_LOCALE, createTranslator } from "@/lib/i18n";

export const dynamic = "force-static";
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  const t = createTranslator(DEFAULT_LOCALE);

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-navy/10 bg-white px-6 py-8 text-navy">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">{t("offline.offline")}</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{t("offline.fallbackTitle")}</h1>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">{t("offline.fallbackBody")}</p>
        <p className="mt-3 text-[13px] leading-5 text-slate-500">{t("offline.storageWarning")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full bg-navy px-4 text-sm font-medium text-white"
          >
            {t("offline.tryLogin")}
          </Link>
        </div>
      </div>
    </main>
  );
}
