import assert from "node:assert/strict";
import test from "node:test";
import { extraEn, extraSw } from "./extra";
import { dictionaries } from "./messages";

function createTranslator(locale: "en" | "sw") {
  const table = dictionaries[locale];
  return (key: keyof typeof extraEn | `nav./rice/customer-storage`, vars?: Record<string, string>) => {
    let text = table[key] ?? dictionaries.en[key] ?? String(key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, value);
      }
    }
    return text;
  };
}

test("English and Kiswahili extra dictionaries share the same keys", () => {
  assert.deepEqual(Object.keys(extraEn).sort(), Object.keys(extraSw).sort());
});

test("Customer Storage glossary is Kiswahili when sw is selected", () => {
  const t = createTranslator("sw");
  assert.equal(t("rice.storage.title"), "Hifadhi ya Wateja");
  assert.equal(t("rice.storage.depositRelease"), "Kuingiza au kutoa mpunga");
  assert.equal(t("rice.storage.existingAccount"), "Akaunti iliyopo");
  assert.equal(t("rice.storage.type"), "Aina ya muamala");
  assert.equal(t("rice.storage.newCustomer"), "Mteja mpya");
  assert.equal(t("rice.storage.deposit"), "Kuingiza mpunga");
  assert.equal(t("rice.storage.release"), "Kutoa mpunga");
  assert.equal(t("rice.storage.customerName"), "Jina la mteja");
  assert.equal(t("rice.storage.phone"), "Namba ya simu");
  assert.equal(t("rice.storage.bags"), "Magunia");
  assert.equal(t("rice.storage.qty"), "Kiasi (kg)");
  assert.equal(t("rice.storage.reference"), "Kumbukumbu");
  assert.equal(t("rice.storage.postMovement"), "Rekodi muamala");
  assert.equal(t("rice.storage.serviceFee"), "Ada ya huduma");
  assert.equal(t("rice.storage.customerAccount"), "Akaunti ya mteja");
  assert.equal(t("rice.storage.feeType"), "Aina ya ada");
  assert.equal(t("rice.storage.fee.STORAGE"), "Hifadhi");
  assert.equal(t("rice.storage.amount"), "Kiasi cha fedha");
  assert.equal(t("rice.storage.paymentMethod"), "Njia ya malipo");
  assert.equal(t("rice.method.CASH"), "Taslimu");
  assert.equal(t("rice.storage.postFee"), "Rekodi ada");
  assert.equal(t("rice.storage.balances"), "Salio la wateja");
  assert.equal(t("rice.storage.account"), "Akaunti");
  assert.equal(t("rice.storage.customer"), "Mteja");
  assert.equal(t("rice.storage.balance"), "Salio");
  assert.equal(t("rice.storage.balancesEmpty"), "Bado hakuna akaunti za hifadhi ya wateja.");
});

test("switching to English restores Customer Storage labels", () => {
  const t = createTranslator("en");
  assert.equal(t("rice.storage.title"), "Customer Storage");
  assert.equal(t("rice.storage.deposit"), "Deposit");
  assert.equal(t("rice.storage.postFee"), "Post fee");
  assert.equal(t("rice.storage.balances"), "Customer balances");
});

test("variable interpolation works in both locales", () => {
  assert.equal(createTranslator("en")("rice.storage.serviceIncome", { period: "This Month" }), "Service income (This Month)");
  assert.equal(createTranslator("sw")("rice.storage.serviceIncome", { period: "Mwezi huu" }), "Mapato ya huduma (Mwezi huu)");
});

test("nav Customer Storage matches the page title in Kiswahili", () => {
  assert.equal(createTranslator("sw")("nav./rice/customer-storage"), "Hifadhi ya Wateja");
});

test("core dictionaries cover every English key in Kiswahili", () => {
  const missing = Object.keys(dictionaries.en).filter((key) => !(key in dictionaries.sw));
  assert.deepEqual(missing, []);
});
