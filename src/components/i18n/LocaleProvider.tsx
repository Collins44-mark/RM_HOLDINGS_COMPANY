"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { savePreferredLocaleAction } from "@/actions/locale";
import {
  createTranslator,
  DEFAULT_LOCALE,
  htmlLang,
  type Locale,
  type Translator,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  organisationName: string;
  timezone: string;
  currency: string;
  t: Translator;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  organisationName: "RM Holdings Ltd",
  timezone: "Africa/Dar_es_Salaam",
  currency: "TZS",
  t: createTranslator(DEFAULT_LOCALE),
  setLocale: async () => undefined,
});

export function LocaleProvider({
  locale,
  organisationName,
  timezone,
  currency,
  children,
}: {
  locale: Locale;
  organisationName: string;
  timezone: string;
  currency: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Locale | null>(null);
  if (pending === locale) setPending(null);
  const current = pending ?? locale;
  useEffect(() => {
    document.documentElement.lang = htmlLang(current);
  }, [current]);

  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale: current,
      organisationName,
      timezone,
      currency,
      t: createTranslator(current),
      setLocale: async (next) => {
        setPending(next);
        document.documentElement.lang = htmlLang(next);
        await savePreferredLocaleAction(next);
        router.refresh();
      },
    };
  }, [current, organisationName, timezone, currency, router]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}
