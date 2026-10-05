import {
  DEFAULT_LOCALE,
  dictionaries,
  LOCALES,
  type Locale,
  type MessageKey,
} from "@/lib/i18n/messages";
import type { NavItem } from "@/lib/config/navigation";

export type { Locale, MessageKey };
export { DEFAULT_LOCALE, LOCALES };

export type Translator = (key: MessageKey, fallback?: string) => string;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "sw";
}

export function parseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function htmlLang(locale: Locale) {
  return locale === "sw" ? "sw" : "en";
}

export function createTranslator(locale: Locale): Translator {
  const table = dictionaries[locale] ?? dictionaries.en;
  return (key, fallback) => table[key] ?? dictionaries.en[key] ?? fallback ?? key;
}

export function navKeyForHref(href: string): MessageKey | null {
  const key = `nav.${href}` as MessageKey;
  return key in dictionaries.en ? key : null;
}

const LABEL_KEYS: Record<string, MessageKey> = {
  Overview: "nav.overview",
  Sales: "nav.sales",
  Inventory: "nav.inventory",
  Promotions: "nav.promotions",
  Purchasing: "nav.purchasing",
  Finance: "nav.finance",
  Reports: "nav.reports",
  "School Dashboard": "nav./school",
  "Rice Dashboard": "nav./rice",
  "Farm Dashboard": "nav./farm",
  "Property Dashboard": "nav./property",
  "Livestock Dashboard": "nav./livestock",
  "Beekeeping Dashboard": "nav./beekeeping",
};

const BUSINESS_UNIT_ROOTS = new Set([
  "/rice",
  "/farm",
  "/supermarket",
  "/property",
  "/livestock",
  "/school",
  "/beekeeping",
]);

export function localizeNavItems(
  items: NavItem[],
  t: Translator,
  parentHref?: string,
): NavItem[] {
  if (parentHref === "/owner/business-units") {
    return items;
  }

  return items.map((item) => {
    const keepStoredName =
      BUSINESS_UNIT_ROOTS.has(item.href) &&
      item.label !== "Overview" &&
      !item.label.endsWith("Dashboard");
    const key = keepStoredName ? null : navKeyForHref(item.href);
    const labelKey = keepStoredName ? undefined : LABEL_KEYS[item.label];
    const catalog = key ? dictionaries.en[key] : null;
    const label =
      labelKey
        ? t(labelKey, item.label)
        : key && catalog === item.label
          ? t(key, item.label)
          : item.label;
    return {
      ...item,
      label,
      children: item.children ? localizeNavItems(item.children, t, item.href) : item.children,
    };
  });
}

export function greetingKeyForHour(hour: number): MessageKey {
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.evening";
}
