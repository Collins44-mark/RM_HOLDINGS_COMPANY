import type { MessageKey, Translator } from "../i18n";

const EXACT: Record<string, MessageKey> = {
  "Something went wrong. Please try again.": "rice.error.generic",
  "This action isn’t available.": "rice.error.unauthorized",
  "Supabase is not configured.": "rice.error.supabase",
  "Farm & Tractor Services ledgers are not in the live database yet.": "farm.error.ledgers",
  "Farm & Tractor Services ledgers are not in the live database yet. Figures are withheld until those records exist.": "farm.error.unavailable",
  "You do not have access to Farm & Tractor Services.": "farm.error.noAccess",
  "Farm business unit was not found.": "farm.error.buMissing",
  "Couldn't load Farm & Tractor Services.": "farm.error.buLoad",
  "Engine hours cannot decrease.": "farm.error.hours",
  "Payment amount must be greater than zero.": "farm.error.pay",
  "That record is already posted.": "rice.error.conflict",
  "Couldn't load this page.": "farm.error.load",
  "Couldn't save. Please try again.": "farm.error.save",
  "Check the quantities and amounts entered.": "rice.error.checkAmounts",
};

export function translateFarmCopy(t: Translator, message: string | null | undefined) {
  if (!message) return "";
  const key = EXACT[message];
  if (key) return t(key);
  return message;
}
