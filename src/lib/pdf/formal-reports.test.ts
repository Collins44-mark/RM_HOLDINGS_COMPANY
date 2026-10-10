import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { FormalReportDocument } from "./formal-layout";
import { pdfFillRect } from "./report-document";
import { buildSchoolReportPdf } from "../school/school-report-document";
import { buildExamResultsPdf } from "../school/exam-results-pdf";
import { buildFeeReceiptPdf } from "../school/fee-receipt-pdf";
import { schoolPageMeta } from "../school/pagination";
import type { SchoolReportKind, SchoolReportWorkspace } from "../school/report-types";
import type { SchoolExamDetail } from "@/actions/school/exams";
import {
  renderInventoryPdf,
  renderProfitLossPdf,
  renderPurchasePdf,
  renderSalesPdf,
} from "../data/supermarket-reports-pdf";
import { renderSalesReportPdf } from "../data/supermarket-sales-report";
import { buildPurchaseDocumentPdf } from "../data/purchase-document-pdf";
import { buildGoodsReceiptDocumentPdf } from "../data/goods-receipt-pdf";
import { buildSupplierInvoiceDocumentPdf } from "../data/supplier-invoice-pdf";
import type {
  InventoryReportData,
  ProfitLossReportData,
  PurchaseReportData,
  SalesReportData,
} from "../data/sample-supermarket-reports";

const out = "/tmp/rm-pdf-audit";

function decode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

function assertFormal(pdf: string, title: string) {
  assert.match(pdf, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(pdf, /Page 1 of \d+/);
  assert.match(pdf, /0\.945 0\.945 0\.945 rg/);
  assert.doesNotMatch(pdf, /0\.043 0\.133 0\.267/);
}

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
    filtersNote: "",
    preparedBy: "System User",
    preparedRole: "Owner",
  };
}

test("pdfFillRect emits an explicit fill colour", () => {
  assert.match(pdfFillRect(0, 0, 10, 10, "0.945 0.945 0.945"), /0\.945 0\.945 0\.945 rg /);
});

test("shared formal document paginates and wraps long cells", () => {
  mkdirSync(out, { recursive: true });
  const doc = new FormalReportDocument({
    businessUnit: "Supermarket System",
    title: "Layout Probe",
    subtitle: "Long names and pagination",
    periodLabel: "October 2026",
    periodDates: "2026-10-01 to 2026-10-31",
    generatedAt: "10 Oct 2026 08:00 AM",
  });
  doc.addMetrics([
    { label: "Revenue", value: "TZS 23,230,000" },
    { label: "Outstanding", value: "TZS 14,986,550" },
  ]);
  doc.addSectionTable(
    "Customers",
    [
      { key: "name", label: "Customer", width: 220 },
      { key: "email", label: "Email", width: 200 },
      { key: "amount", label: "Amount", width: 91, align: "right" },
    ],
    Array.from({ length: 40 }, (_, index) => ({
      name: `Customer ${index + 1} With An Extra Long Trading Name`,
      email: `customer${index + 1}.verylong@school-domain.example.com`,
      amount: "TZS 1,250,000",
    })),
  );
  const bytes = doc.build();
  writeFileSync(`${out}/layout-probe.pdf`, bytes);
  const pdf = decode(bytes);
  assertFormal(pdf, "Layout Probe");
  assert.match(pdf, /Page 1 of [2-9]/);
  assert.match(pdf, /MediaBox \[0 0 595 842\]/);
});

test("school, supermarket, document and receipt builders share the formal layout", () => {
  mkdirSync(out, { recursive: true });

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
    ],
    [
      { label: "Matching Guardians", value: "1" },
      { label: "Listed Relationships", value: "1" },
    ],
  );
  writeFileSync(`${out}/school-parents.pdf`, buildSchoolReportPdf(parents));
  assertFormal(decode(buildSchoolReportPdf(parents)), "Parents / Guardians Report");

  const sales: SalesReportData = {
    periodLabel: "This month",
    periodDates: "1 Oct 2026 - 10 Oct 2026",
    comparisonLabel: "vs last month",
    totalRevenue: 8_243_450,
    totalSales: 412,
    itemsSold: 980,
    discounts: 12_000,
    returnsAmount: 45_000,
    returnsCount: 3,
    deltas: { revenue: 4, sales: 2, itemsSold: 1, returns: 0 },
    paymentBreakdown: [
      { method: "Cash", amount: 4_000_000, count: 200, percentage: 48.5 },
      { method: "Mobile Money", amount: 4_243_450, count: 212, percentage: 51.5 },
    ],
    cashierPerformance: [
      { cashier: "Amina Mwambe With A Long Name", sales: 200, itemsSold: 400, revenue: 4_000_000 },
    ],
    dailySales: [],
    topProducts: [{ name: "Rice 25kg Premium Long Grain", quantity: 40, revenue: 1_840_000 }],
    lowProducts: [{ name: "Bar Soap 800g", quantity: 2, revenue: 5_600 }],
    totalTransactions: 412,
    sales: [],
  };
  writeFileSync(`${out}/supermarket-sales.pdf`, renderSalesPdf(sales));
  assertFormal(decode(renderSalesPdf(sales)), "Sales Report");

  const inventory: InventoryReportData = {
    periodLabel: "This month",
    periodDates: "1 Oct 2026 - 10 Oct 2026",
    comparisonLabel: "vs last month",
    totalProducts: 80,
    totalStockUnits: 1200,
    totalInventoryValue: 45_000_000,
    inStock: 70,
    lowStock: 6,
    outOfStock: 4,
    expiringSoon: 3,
    expiredItems: 2,
    expiredStockValue: 80_000,
    deltas: { products: 0, stockUnits: 1, inventoryValue: 2, lowStock: 0 },
    movements: [{ label: "Purchases received", count: 8, quantity: 400 }],
    writeOffs: {
      loss: { events: 1, quantity: 2, value: 12_000 },
      damage: { events: 1, quantity: 1, value: 8_000 },
      expired: { events: 2, quantity: 4, value: 80_000 },
    },
    writeOffRows: [
      {
        date: "2026-10-04",
        product: "Milk 500ml",
        type: "Expired",
        quantity: 4,
        value: 80_000,
        reason: "Past labelled expiry",
      },
    ],
    lowStockProducts: [],
    valuation: Array.from({ length: 36 }, (_, index) => ({
      name: `Product ${index + 1} With A Long Pack Description`,
      quantity: 12 + index,
      buyingPrice: 2_500,
      stockValue: (12 + index) * 2_500,
      status: index % 7 ? "In Stock" : "Low Stock",
      category: "Grocery",
    })),
    expiryRows: [],
  };
  writeFileSync(`${out}/supermarket-inventory.pdf`, renderInventoryPdf(inventory));
  assertFormal(decode(renderInventoryPdf(inventory)), "Inventory Report");
  assert.match(decode(renderInventoryPdf(inventory)), /Page 1 of [2-9]/);

  const purchases: PurchaseReportData = {
    periodLabel: "This month",
    periodDates: "1 Oct 2026 - 10 Oct 2026",
    comparisonLabel: "vs last month",
    totalPurchases: 12_500_000,
    purchaseCount: 9,
    itemsPurchased: 240,
    supplierCount: 4,
    amountPaid: 9_000_000,
    outstanding: 3_500_000,
    averageOrderValue: 1_388_889,
    deltas: { purchases: 1, orders: 0, items: 2, outstanding: 3 },
    purchases: [
      {
        number: "PO-00019",
        supplier: "Dar Wholesale Trading Company Limited",
        date: "2026-10-03",
        items: 18,
        amount: 2_400_000,
        paymentStatus: "Partial",
        status: "Received",
      },
    ],
    suppliers: [{ name: "Dar Wholesale Trading Company Limited", purchases: 2_400_000, paid: 1_000_000, outstanding: 1_400_000 }],
    paymentStatusSummary: [],
  };
  writeFileSync(`${out}/supermarket-purchases.pdf`, renderPurchasePdf(purchases));
  assertFormal(decode(renderPurchasePdf(purchases)), "Purchase Report");

  const pnl: ProfitLossReportData = {
    periodLabel: "This month",
    periodDates: "1 Oct 2026 - 10 Oct 2026",
    comparisonLabel: "vs last month",
    revenue: 8_243_450,
    costOfGoodsSold: 5_100_000,
    grossProfit: 3_143_450,
    operatingExpenses: 683_500,
    otherIncome: 0,
    inventoryLoss: 80_000,
    netProfit: 2_379_950,
    grossMargin: 38.1,
    netMargin: 28.9,
    operatingExpenseRatio: 8.3,
    inventoryTurnover: 4.2,
    averageOrderValue: 20_008,
    breakEvenSales: 1_200_000,
    deltas: { revenue: 4, cogs: 2, grossProfit: 3, operatingExpenses: 1 },
    productProfit: 3_143_450,
    topProducts: [],
    expenses: [{ category: "Utilities", description: "Electricity and water for the store", amount: 220_000 }],
    topOperatingExpenses: [],
  };
  writeFileSync(`${out}/supermarket-pnl.pdf`, renderProfitLossPdf(pnl));
  assertFormal(decode(renderProfitLossPdf(pnl)), "Profit & Loss");

  writeFileSync(
    `${out}/purchase-document.pdf`,
    buildPurchaseDocumentPdf({
      number: "PO-00019",
      poNumber: "PO-00019",
      supplierName: "Dar Wholesale Trading Company Limited",
      orderDate: "2026-10-01",
      receivedDate: "2026-10-03",
      status: "RECEIVED",
      discount: 0,
      tax: 180_000,
      subtotal: 2_220_000,
      grandTotal: 2_400_000,
      paymentStatus: "PARTIAL",
      amountPaid: 1_000_000,
      outstanding: 1_400_000,
      receipts: ["GRN-00011"],
      lines: [
        { name: "Rice 25kg Premium Long Grain", quantity: 20, buyingPrice: 40_000, lineTotal: 800_000 },
      ],
    }),
  );
  assertFormal(decode(buildPurchaseDocumentPdf({
    number: "PO-00019",
    poNumber: "PO-00019",
    supplierName: "Dar Wholesale Trading Company Limited",
    orderDate: "2026-10-01",
    receivedDate: "2026-10-03",
    status: "RECEIVED",
    discount: 0,
    tax: 180_000,
    subtotal: 2_220_000,
    grandTotal: 2_400_000,
    paymentStatus: "PARTIAL",
    amountPaid: 1_000_000,
    outstanding: 1_400_000,
    receipts: ["GRN-00011"],
    lines: [{ name: "Rice 25kg", quantity: 20, buyingPrice: 40_000, lineTotal: 800_000 }],
  })), "Purchase Document");

  writeFileSync(
    `${out}/goods-receipt.pdf`,
    buildGoodsReceiptDocumentPdf({
      number: "GRN-00011",
      poNumber: "PO-00019",
      supplierName: "Dar Wholesale Trading Company Limited",
      receivedDate: "2026-10-03",
      receivedBy: "Store Keeper",
      status: "Posted",
      itemCount: 20,
      total: 800_000,
      lines: [
        {
          name: "Rice 25kg Premium Long Grain",
          sku: "RICE-25",
          orderedQty: 20,
          receivedQty: 20,
          unitCost: 40_000,
          lineTotal: 800_000,
        },
      ],
    }),
  );

  writeFileSync(
    `${out}/supplier-invoice.pdf`,
    buildSupplierInvoiceDocumentPdf({
      number: "INV-4401",
      supplierName: "Dar Wholesale Trading Company Limited",
      poNumber: "PO-00019",
      receiptNumber: "GRN-00011",
      invoiceDate: "2026-10-04",
      dueDate: "2026-10-18",
      subtotal: 2_220_000,
      tax: 180_000,
      total: 2_400_000,
      amountPaid: 1_000_000,
      paymentStatus: "PARTIAL",
      verificationStatus: "Verified",
      notes: "",
      lines: [{ name: "Rice 25kg Premium Long Grain", quantity: 20, unitCost: 40_000, lineTotal: 800_000 }],
    }),
  );

  writeFileSync(
    `${out}/fee-receipt.pdf`,
    buildFeeReceiptPdf({
      schoolName: "Muhuga Nursery & Primary School",
      studentName: "Candy Joseph Sanga With Extra Middle Names",
      studentNumber: "STU-000001",
      admissionNumber: "ADM-000001",
      academicYearName: "2026",
      levelName: "PRIMARY",
      className: "STANDARD-3",
      streamName: "A",
      feeContext: "Tuition Term 1",
      paymentNumber: "FEE-00088",
      paymentDate: "2026-10-05",
      amount: 250_000,
      methodLabel: "Cash",
      reference: "REF-LONG-REFERENCE-VALUE",
      recordedByName: "Accounts Clerk",
      verifiedByName: "Head Teacher",
      outstandingAmount: 50_000,
    }),
  );
  assertFormal(decode(buildFeeReceiptPdf({
    schoolName: "Muhuga Nursery & Primary School",
    studentName: "Candy Joseph Sanga",
    studentNumber: "STU-000001",
    admissionNumber: "ADM-000001",
    academicYearName: "2026",
    levelName: "PRIMARY",
    className: "STANDARD-3",
    streamName: "A",
    feeContext: "Tuition Term 1",
    paymentNumber: "FEE-00088",
    paymentDate: "2026-10-05",
    amount: 250_000,
    methodLabel: "Cash",
    reference: "REF-01",
    recordedByName: "Accounts Clerk",
    verifiedByName: "Head Teacher",
    outstandingAmount: 50_000,
  })), "Fee Payment Receipt");

  const examDetail: SchoolExamDetail = {
    exam: {
      id: "exam-1",
      name: "Midterm Assessment",
      examType: "midterm",
      examDate: "2026-10-02",
      status: "published",
      maxMarks: 100,
      classId: "class-1",
      className: "STANDARD-3",
      levelId: "level-1",
      levelName: "PRIMARY",
      yearName: "2026",
      termName: "TERM-1",
      subjectCount: 3,
    },
    schoolName: "Muhuga Nursery & Primary School",
    subjects: [
      { id: "s1", name: "Mathematics" },
      { id: "s2", name: "English Language" },
      { id: "s3", name: "Science" },
    ],
    students: [],
    marks: [],
    gradingBands: [],
    gradingConfigured: true,
    gradingMessage: null,
  };
  const examBytes = buildExamResultsPdf({
    detail: examDetail,
    schoolName: examDetail.schoolName,
    rows: Array.from({ length: 28 }, (_, index) => ({
      studentName: `Student ${index + 1} With A Particularly Long Name`,
      marks: [80, 70, 90],
      grade: "A",
      average: 80,
      position: index + 1,
    })),
  });
  writeFileSync(`${out}/exam-results.pdf`, examBytes);
  const examPdf = decode(examBytes);
  assertFormal(examPdf, "Midterm Assessment");
  assert.match(examPdf, /\(Avg\.\)/);
  assert.match(examPdf, /\(Grade\)/);
  assert.match(examPdf, /MediaBox \[0 0 842 595\]/);

  writeFileSync(
    `${out}/legacy-sales.pdf`,
    renderSalesReportPdf({
      sales: [],
      periodLabel: "This month",
      periodDates: "1 Oct 2026 - 10 Oct 2026",
      cashierLabel: "All cashiers",
      paymentLabel: "All methods",
      statusLabel: "All statuses",
    }),
  );
});
