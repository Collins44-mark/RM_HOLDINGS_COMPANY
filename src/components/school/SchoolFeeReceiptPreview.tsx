import { formatAmount } from "@/lib/format/currency";
import { cn } from "@/lib/cn";
import { receiptLines, type FeeReceiptPayload } from "@/lib/school/fee-receipt-pdf";
import {
  formatReceiptDateTime,
  formatSchoolReceiptNumber,
  receiptAddressLine,
  receiptClassLabel,
  receiptContactLine,
  receiptStatusLabel,
  tanzanianShillingsInWords,
} from "@/lib/school/fee-receipt";
import { formatCompactStudentNumber } from "@/lib/school/student-number";

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] gap-2 py-[3px]">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="min-w-0 text-[12.5px] font-semibold leading-4 text-[#0b2244]">{value}</p>
    </div>
  );
}

export function SchoolFeeReceiptPreview({ receipt }: { receipt: FeeReceiptPayload }) {
  const number = formatSchoolReceiptNumber(receipt.paymentNumber);
  const status = receiptStatusLabel(receipt.status);
  const address = receiptAddressLine(receipt.schoolAddress, receipt.schoolCity);
  const contact = receiptContactLine(receipt.schoolPhone, receipt.schoolEmail);
  const classLabel = receiptClassLabel(receipt.levelName, receipt.className, receipt.streamName);
  const lines = receiptLines(receipt);
  const paid = status === "PAID";

  return (
    <article className="rounded-[18px] border border-[#d7e3ef] bg-white px-4 py-4 text-[#0b2244] shadow-[0_10px_28px_rgba(15,35,64,0.06)]">
      <header className="flex items-start gap-3 border-b border-[#0b2244] pb-3">
        {receipt.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={receipt.logoUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />
        ) : (
          <span className="h-12 w-12 shrink-0" />
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold uppercase tracking-[-0.03em]">{receipt.schoolName}</h2>
          {address ? <p className="mt-0.5 text-[11px] text-slate-500">{address}</p> : null}
          {contact ? <p className="text-[11px] text-slate-500">{contact}</p> : null}
        </div>
      </header>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-semibold tracking-[-0.04em]">PAYMENT RECEIPT</h3>
          <p className="mt-0.5 text-[11.5px] text-slate-500">This is an official receipt for school payments.</p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
              paid ? "bg-[#e7f6ea] text-[#22804a]" : "bg-slate-100 text-slate-500",
            )}
          >
            {status}
          </span>
          <p className="mt-1.5 text-[10.5px] text-slate-500">Receipt No.</p>
          <p className="text-[12.5px] font-semibold">{number}</p>
          <p className="mt-1 text-[10.5px] text-slate-500">Date & Time</p>
          <p className="text-[12px] font-semibold">{formatReceiptDateTime(receipt.recordedAt, receipt.paymentDate) || "—"}</p>
        </div>
      </div>

      <section className="mt-3 grid grid-cols-1 gap-x-4 rounded-xl bg-[#f3f7fb] px-3 py-2.5 sm:grid-cols-2">
        <div>
          <Detail label="Student Name" value={receipt.studentName} />
          <Detail label="Student ID" value={formatCompactStudentNumber(receipt.studentNumber)} />
          <Detail label="Class" value={classLabel} />
          <Detail label="Academic Year" value={receipt.academicYearName} />
        </div>
        <div>
          <Detail label="Payment Category" value={receipt.paymentCategory} />
          <Detail label="Description" value={receipt.feeContext} />
          <Detail label="Payment Method" value={receipt.methodLabel} />
          <Detail label="Reference" value={receipt.reference || "—"} />
          <Detail label="Received By" value={receipt.recordedByName || "—"} />
        </div>
      </section>

      <table className="mt-3 w-full text-left text-[12px]">
        <thead>
          <tr className="bg-[#e8f3fb] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0b2244]">
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount (TZS)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className={cn("border-t border-[#d7e6f2]", line.emphasize && "bg-[#e4eef8] font-semibold")}>
              <td className="px-3 py-2">{line.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatAmount(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 rounded-xl bg-[#f3f7fb] px-3 py-2.5 text-[12.5px]">
        <span className="text-slate-500">Amount in Words: </span>
        <span className="font-semibold">{tanzanianShillingsInWords(receipt.amount)}</span>
      </p>

      <footer className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-slate-500">Thank you for your payment.</p>
          <p className="mt-1 text-[12.5px] font-semibold uppercase tracking-[-0.02em]">{receipt.schoolName}</p>
        </div>
        <div className="min-w-[9rem] text-center">
          <p className="border-b border-dashed border-slate-300 pb-6 text-[11px] text-slate-400">{receipt.signatoryName}</p>
          <p className="mt-1 text-[10.5px] text-slate-500">Authorized Signature</p>
        </div>
      </footer>
    </article>
  );
}
