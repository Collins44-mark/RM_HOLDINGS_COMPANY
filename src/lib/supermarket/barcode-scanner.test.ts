import assert from "node:assert/strict";
import test from "node:test";
import { createScanGate } from "./barcode";
import { ScanAssembler, SCAN_IDLE_MS, SCAN_INTER_KEY_MS, decodeHidBarcodeReport } from "./barcode-scanner";

function type(assembler: ScanAssembler, text: string, start: number, gap: number) {
  let now = start;
  let last: ReturnType<ScanAssembler["push"]> = "ignore";
  for (const char of text) {
    last = assembler.push(char, now);
    now += gap;
  }
  return { last, now };
}

test("slow typing is not a barcode, even when Enter follows", () => {
  const assembler = new ScanAssembler();
  type(assembler, "rice", 0, 180);
  assert.equal(assembler.finish(), "");
});

test("a fast burst ending in Enter is one barcode", () => {
  const assembler = new ScanAssembler();
  const typed = type(assembler, "6001248100011", 1_000, 12);
  assert.equal(typed.last, "burst");
  assert.equal(assembler.finish(), "6001248100011");
  assert.equal(assembler.idleReady(typed.now + SCAN_IDLE_MS), false);
});

test("a fast burst completes on the idle timeout when the scanner sends no Enter", () => {
  const assembler = new ScanAssembler();
  const typed = type(assembler, "6001248100028", 0, SCAN_INTER_KEY_MS);
  assert.equal(assembler.idleReady(typed.now - SCAN_INTER_KEY_MS + SCAN_IDLE_MS - 1), false);
  assert.equal(assembler.idleReady(typed.now - SCAN_INTER_KEY_MS + SCAN_IDLE_MS), true);
  assert.equal(assembler.finish(), "6001248100028");
});

test("a burst shorter than a barcode is ignored", () => {
  const assembler = new ScanAssembler();
  type(assembler, "123", 0, 10);
  assert.equal(assembler.finish(), "");
});

test("Tab is the same kind of suffix as Enter", () => {
  const assembler = new ScanAssembler();
  type(assembler, "SKU-1001", 0, 15);
  assert.equal(assembler.finish(), "SKU-1001");
});

test("the same code is ignored inside the duplicate window and accepted after it", () => {
  const gate = createScanGate(450);
  assert.equal(gate("6001248100011"), true);
  assert.equal(gate("6001248100011"), false);
  assert.equal(gate("6001248100028"), true);
});

test("consecutive different scans both pass the duplicate gate", () => {
  const gate = createScanGate(450);
  assert.equal(gate("11112222"), true);
  assert.equal(gate("33334444"), true);
});

test("an HID POS report yields the barcode text and ignores a header byte", () => {
  const bytes = new Uint8Array([0x02, ..."6001248100011".split("").map((char) => char.charCodeAt(0)), 0]);
  assert.equal(decodeHidBarcodeReport(new DataView(bytes.buffer)), "6001248100011");
  const noise = new Uint8Array([0x01, 0x02, 0x03]);
  assert.equal(decodeHidBarcodeReport(new DataView(noise.buffer)), "");
});
