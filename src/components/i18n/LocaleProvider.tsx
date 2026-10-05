"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  type Locale,
  type Translator,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  organisationName: string;
  timezone: string;
  currency: string;
  t: Translator;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  organisationName: "RM Holdings Ltd",
  timezone: "Africa/Dar_es_Salaam",
  currency: "TZS",
  t: createTranslator(DEFAULT_LOCALE),
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
  const value: LocaleContextValue = {
    locale,
    organisationName,
    timezone,
    currency,
    t: createTranslator(locale),
  };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}
