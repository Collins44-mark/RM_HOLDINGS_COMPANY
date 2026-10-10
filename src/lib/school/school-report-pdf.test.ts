import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { schoolPageMeta } from "./pagination";
import { buildSchoolReportPdf } from "./school-report-document";
import type { SchoolReportKind, SchoolReportWorkspace } from "./report-types";

function workspace(
  kind: SchoolReportKind,
  rows: Array<Record<string, string>>,
  cards: SchoolReportWorkspace["cards"] = [],
): SchoolReportWorkspace {
  return {
    kind,
    available: [kind],
    schoolName: "Muhuga Nursery & Primary School",
    periodLabel: "This Month (October 2026)",
    from: "2026-10-01",
    to: "2026-10-31",
    cards,
    columns: Object.keys(rows[0] ?? { student: "" }).map((key) => ({ key, label: key })),
    rows,
    page: schoolPageMeta(1, rows.length),
    years: [],
    levels: [],
    classes: [],
    streams: [],
    buses: [],
    expenseTypes: [],
    filtersNote: "Guardian listings are unique in the summary even when several students are linked.",
    preparedBy: "System User",
    preparedRole: "Owner",
  };
}

const parents = workspace(
  "parents",
  [
    {
      guardian: "Joseph Bartholomew Sanga-Mwambe",
      phone: "0764655588",
      email: "tabiancollins89@gmail.com",
      student: "Kelvin Joseph Sanga",
      level: "PRIMARY",
      className: "STANDARD-3",
      stream: "A",
    },
    {
      guardian: "Amina Mwambe KISODA",
      phone: "0757535558",
      email: "—",
      student: "Candy Joseph Sanga With Extra Middle Names",
      level: "PRIMARY",
      className: "STD 3",
      stream: "A",
    },
    {
      guardian: "Mibumo",
      phone: "0744787488",
      email: "verylong.guardian.email.address@school-domain.example.com",
      student: "Isack Mibumo Dili",
      level: "PRIMARY",
      className: "STANDARD-3",
      stream: "B",
    },
  ],
  [
    { label: "Matching Guardians", value: "3" },
    { label: "Listed Relationships", value: "3" },
  ],
);

function decode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

test("school report export uses the formal builder, not ReportDocument section bars", () => {
  const wrapper = readFileSync(new URL("./school-reports-pdf.ts", import.meta.url), "utf8");
  assert.match(wrapper, /buildSchoolReportPdf\(workspace\)/);
  assert.doesNotMatch(wrapper, /new ReportDocument/);
  const pdf = decode(buildSchoolReportPdf(parents));
  assert.match(pdf, /Parents \/ Guardians Report/);
  assert.match(pdf, /Guardian/);
  assert.match(pdf, /Student/);
  assert.match(pdf, /Email/);
  assert.match(pdf, /Page 1 of 1/);
  assert.doesNotMatch(pdf, /\/Type \/Page[^\n]*MediaBox \[0 0 595 842\]/);
  assert.match(pdf, /MediaBox \[0 0 842 595\]/);
  assert.doesNotMatch(pdf, /\(Summary\)/);
  assert.doesNotMatch(pdf, /\(Records\)/);
  assert.doesNotMatch(pdf, /\(Prepared by:\)/);
  assert.match(pdf, /0\.945 0\.945 0\.945 rg/);
  assert.doesNotMatch(pdf, /0\.059 0\.090 0\.165/);
});

test("all five school report builders emit headers and stay landscape", () => {
  const fixtures: SchoolReportWorkspace[] = [
    parents,
    workspace("admissions", [
      {
        admissionNumber: "ADM-000001",
        student: "collins Mark taban",
        date: "2026-01-15",
        level: "PRIMARY",
        className: "STANDARD-3",
        stream: "A",
        year: "2026",
        term: "TERM-1",
        status: "Completed",
      },
    ]),
    workspace(
      "finance",
      [
        {
          student: "Amina Mwambe",
          studentNumber: "STU-000002",
          level: "PRIMARY",
          className: "STD 3",
          year: "2026",
          billed: "TZS 2,000,000",
          paid: "TZS 1,810,000",
          outstanding: "TZS 190,000",
          status: "Partially Paid",
        },
      ],
      [
        { label: "Fees Billed", value: "TZS 23,230,000" },
        { label: "Fees Collected", value: "TZS 8,243,450" },
        { label: "Outstanding Fees", value: "TZS 14,986,550" },
        { label: "Operating Expenses", value: "TZS 683,500" },
      ],
    ),
    workspace("students", [
      {
        name: "Student With A Particularly Long Name For Wrapping",
        studentNumber: "STU-000001",
        admissionNumber: "ADM-000001",
        level: "PRIMARY",
        className: "STANDARD-3",
        stream: "A",
        status: "Active",
      },
    ]),
    workspace(
      "transport",
      [
        {
          date: "2026-10-05",
          bus: "TAT-880 · BUS-01",
          type: "Fuel",
          description: "Refuelling at the main depot with extra notes",
          amount: "TZS 1,250,000",
          reference: "REF-001",
          status: "Posted",
        },
      ],
      [
        { label: "Total Posted Transport Expenses", value: "TZS 250,000" },
        { label: "Fuel Expenses", value: "TZS 110,000" },
        { label: "Maintenance Expenses", value: "TZS 140,000" },
        { label: "Transactions", value: "5" },
      ],
    ),
  ];

  const out = "/tmp/school-report-pdfs";
  mkdirSync(out, { recursive: true });
  for (const item of fixtures) {
    const bytes = buildSchoolReportPdf(item);
    writeFileSync(`${out}/${item.kind}.pdf`, bytes);
    const pdf = decode(bytes);
    assert.match(pdf, /MediaBox \[0 0 842 595\]/);
    assert.doesNotMatch(pdf, /\(Summary\) Tj/);
    assert.doesNotMatch(pdf, /\(Records\) Tj/);
  }

  const many = workspace(
    "parents",
    Array.from({ length: 36 }, (_, index) => ({
      guardian: `Guardian ${index + 1} With A Long Family Name`,
      phone: "0764000000",
      email: `guardian${index + 1}.verylong@school-domain.example.com`,
      student: `Student ${index + 1} Also Has A Long Name`,
      level: "PRIMARY",
      className: "STANDARD-3",
      stream: index % 2 ? "B" : "A",
    })),
  );
  writeFileSync(`${out}/parents-many.pdf`, buildSchoolReportPdf(many));
  const manyPdf = decode(buildSchoolReportPdf(many));
  assert.match(manyPdf, /Page 1 of [2-9]/);
});
