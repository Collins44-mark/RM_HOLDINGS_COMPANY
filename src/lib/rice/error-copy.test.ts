import assert from "node:assert/strict";
import test from "node:test";
import { dictionaries, type MessageKey } from "../i18n/messages";
import { translateRiceCopy } from "./error-copy";
import type { Translator } from "../i18n";

function translator(locale: "en" | "sw"): Translator {
  return ((key: MessageKey) => dictionaries[locale][key] ?? dictionaries.en[key] ?? String(key)) as Translator;
}

test("known rice validation errors are translated", () => {
  const t = translator("sw");
  assert.equal(translateRiceCopy(t, "Quantity must be greater than zero."), "Kiasi lazima kiwe zaidi ya sifuri.");
  assert.equal(translateRiceCopy(t, "Something went wrong. Please try again."), "Kuna hitilafu. Tafadhali jaribu tena.");
});

test("unknown messages and user notes stay unchanged", () => {
  const t = translator("sw");
  assert.equal(translateRiceCopy(t, "RCP-0001 delayed delivery"), "RCP-0001 delayed delivery");
});

test("English translator keeps the original rice error wording", () => {
  const t = translator("en");
  assert.equal(translateRiceCopy(t, "Quantity must be greater than zero."), "Quantity must be greater than zero.");
});
