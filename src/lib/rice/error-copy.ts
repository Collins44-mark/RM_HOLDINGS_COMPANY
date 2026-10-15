import type { MessageKey, Translator } from "../i18n";
import { RICE_LEDGER_UNAVAILABLE } from "./overview";

const EXACT: Record<string, MessageKey> = {
  "Something went wrong. Please try again.": "rice.error.generic",
  "This action isn’t available.": "rice.error.unauthorized",
  "Quantity must be greater than zero.": "rice.error.qty",
  "Unit price cannot be negative.": "rice.error.price",
  "Paddy input must be greater than zero.": "rice.error.paddyInput",
  "Enter at least one milling output.": "rice.error.millOutput",
  "Add at least one sale line.": "rice.error.saleLine",
  "Enter an item code and name.": "rice.error.itemCode",
  "Item type is invalid.": "rice.error.itemType",
  "Unknown warehouse category.": "rice.error.unknownKind",
  "Rice mill ledgers are not in the live database yet.": "rice.error.ledgers",
  "Couldn't load milling production.": "rice.error.millingLoad",
  "Couldn't load rice items.": "rice.error.itemsLoad",
  "Couldn't load parties.": "rice.error.parties",
  "Couldn't load purchases.": "rice.error.purchases",
  "Couldn't load milling batches.": "rice.error.batches",
  "Couldn't load stock movements.": "rice.error.movements",
  "Couldn't load sales.": "rice.error.sales",
  "Couldn't load customer storage.": "rice.error.storage",
  "Couldn't load service income.": "rice.error.services",
  "Couldn't load expenses.": "rice.error.expenses",
  "Couldn't load rice mill ledgers.": "rice.error.ledgersLoad",
  "Supabase is not configured.": "rice.error.supabase",
  "Couldn't load Rice Mill & Warehouse.": "rice.error.buLoad",
  "Rice Mill business unit was not found.": "rice.error.buMissing",
  "You do not have access to Rice Mill & Warehouse.": "rice.error.noAccess",
  "That record is already posted.": "rice.error.conflict",
  "Check the quantities and amounts entered.": "rice.error.checkAmounts",
  "No rice on hand.": "rice.overview.noRice",
  "No company stock on hand.": "rice.overview.noStock",
  "No milling production records for today.": "rice.overview.noMillingToday",
  "Net profit cannot be calculated until rice sales and costs are recorded.": "rice.overview.netUnavailable",
  "Rice grade quantities are not available.": "rice.overview.gradeUnavailable",
  "Current rice inventory is not available.": "rice.overview.stockUnavailable",
  "No posted service income this period.": "rice.overview.serviceEmpty",
  [RICE_LEDGER_UNAVAILABLE]: "rice.error.unavailable",
};

export function translateRiceCopy(t: Translator, message: string | null | undefined) {
  if (!message) return "";
  const key = EXACT[message];
  if (key) return t(key);
  if (message.startsWith("No service income in") || message.startsWith("No posted rice service-income")) {
    return t("rice.storage.serviceEmpty");
  }
  if (message.startsWith("No posted rice sales ledger")) return t("rice.sales.empty");
  return message;
}
