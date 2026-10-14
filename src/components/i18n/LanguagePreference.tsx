"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n";

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

export function LanguagePreference({ className }: { className?: string }) {
  const { locale, t, setLocale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className={className ?? "rounded-[24px] border border-white/70 bg-white/72 p-5 shadow-[0_10px_30px_rgba(15,35,64,0.06)] backdrop-blur-xl"}>
      <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">{t("language.title")}</h2>
      <p className="mt-1 text-[13px] text-slate-500">{t("language.subtitle")}</p>
      <label className="mt-4 block max-w-sm">
        <span className="mb-1.5 block text-[13px] text-slate-500">{t("language.yourLanguage")}</span>
        <select
          className={fieldClass}
          value={locale}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as Locale;
            setBusy(true);
            setMessage(null);
            void setLocale(next)
              .then(() => setMessage(t("language.saved")))
              .catch(() => setMessage(t("language.saveError")))
              .finally(() => setBusy(false));
          }}
        >
          <option value="en">{t("settings.language.en")}</option>
          <option value="sw">{t("settings.language.sw")}</option>
        </select>
      </label>
      {message ? <p className="mt-3 text-[13px] text-slate-600">{message}</p> : null}
    </section>
  );
}
