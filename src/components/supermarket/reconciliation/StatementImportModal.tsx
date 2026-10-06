"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  confirmBankStatementImportAction,
  parseBankStatementAction,
  type BankStatementPreview,
} from "@/actions/supermarket/bank-statement-import";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { assessStatementRow, type StatementPreviewRow } from "@/lib/supermarket/bank-statement";

export function StatementImportButton({
  accountId,
  disabled,
  onImported,
}: {
  accountId: string | null;
  disabled?: boolean;
  onImported: (count: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (next) setFile(next);
        }}
      />
      <button
        type="button"
        className={primaryButton}
        disabled={disabled || !accountId}
        onClick={() => inputRef.current?.click()}
      >
        Import Statement
      </button>
      {file && accountId ? (
        <StatementImportModal
          accountId={accountId}
          file={file}
          onClose={() => setFile(null)}
          onImported={(count) => {
            setFile(null);
            onImported(count);
          }}
        />
      ) : null}
    </>
  );
}

function StatementImportModal({
  accountId,
  file,
  onClose,
  onImported,
}: {
  accountId: string;
  file: File;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [rows, setRows] = useState<StatementPreviewRow[]>([]);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const parseKey = `${accountId}:${file.name}:${file.size}:${file.lastModified}`;
  const [parsedKey, setParsedKey] = useState<string | null>(null);
  const reading = parsedKey !== parseKey;

  useEffect(() => {
    // Portal target is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    const data = new FormData();
    data.set("accountId", accountId);
    data.set("file", file);
    void parseBankStatementAction(data).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        setRows([]);
        setParsedKey(parseKey);
        return;
      }
      setError(null);
      setPreview(result.preview);
      setRows(result.preview.rows);
      setParsedKey(parseKey);
    });
    return () => {
      active = false;
    };
  }, [accountId, file, parseKey]);

  const reviewCount = rows.filter((row) => row.needsReview || !row.valid).length;
  const duplicateCount = rows.filter((row) => row.duplicate).length;
  const newCount = rows.filter((row) => row.valid && (includeDuplicates || !row.duplicate)).length;
  const canImport = !reading && !importing && reviewCount === 0 && newCount > 0;

  const periodLabel = useMemo(() => {
    if (!preview?.periodStart) return "Not detected";
    if (!preview.periodEnd || preview.periodEnd === preview.periodStart) return preview.periodStart;
    return `${preview.periodStart} – ${preview.periodEnd}`;
  }, [preview]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !importing) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importing, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/25 px-4 backdrop-blur-[3px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cancel" disabled={importing} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="statement-import-title"
        className="relative z-[91] flex max-h-[min(92dvh,40rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white/94 shadow-[0_24px_60px_rgba(15,35,64,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl"
      >
        <div className="border-b border-black/[0.04] px-5 py-4 sm:px-6">
          <h2 id="statement-import-title" className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
            Review Bank Statement
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">{reading ? "Reading statement…" : file.name}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {error ? (
            <p className="text-[13.5px] leading-relaxed text-[#c45b66]">{error}</p>
          ) : reading ? (
            <p className="text-[13.5px] text-slate-500">Reading statement…</p>
          ) : preview ? (
            <>
              <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                <div className="rounded-[14px] border border-white/80 bg-white/70 px-3.5 py-2.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Bank Account</dt>
                  <dd className="mt-1 font-medium text-navy">{preview.accountLabel}</dd>
                </div>
                <div className="rounded-[14px] border border-white/80 bg-white/70 px-3.5 py-2.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Statement Period</dt>
                  <dd className="mt-1 font-medium text-navy">{periodLabel}</dd>
                </div>
                <div className="rounded-[14px] border border-white/80 bg-white/70 px-3.5 py-2.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Detected Transactions</dt>
                  <dd className="mt-1 font-medium text-navy">{rows.length}</dd>
                </div>
                <div className="rounded-[14px] border border-white/80 bg-white/70 px-3.5 py-2.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Import summary</dt>
                  <dd className="mt-1 font-medium text-navy">
                    {newCount} new · {duplicateCount} possible duplicates
                  </dd>
                </div>
              </dl>
              {reviewCount > 0 ? (
                <p className="mt-3 text-[13px] font-medium text-[#b5812a]">
                  {reviewCount} transaction{reviewCount === 1 ? "" : "s"} need review
                </p>
              ) : null}
              {preview.warnings.map((warning) => (
                <p key={warning} className="mt-2 text-[13px] text-[#b5812a]">
                  {warning}
                </p>
              ))}
              {duplicateCount > 0 ? (
                <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={includeDuplicates}
                    onChange={(event) => setIncludeDuplicates(event.target.checked)}
                  />
                  Include possible duplicates
                </label>
              ) : null}
              <div className="mt-4 overflow-x-auto rounded-[16px] border border-black/[0.04]">
                <table className="min-w-full text-left text-[12.5px]">
                  <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.key} className="border-t border-black/[0.04] align-top">
                        <td className="px-2 py-1.5">
                          <input
                            className={cn(inputClass, "h-9 text-[12.5px]")}
                            value={row.transactionDate}
                            onChange={(event) => patchRow(setRows, index, { transactionDate: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={cn(inputClass, "h-9 text-[12.5px]")}
                            value={row.reference}
                            onChange={(event) => patchRow(setRows, index, { reference: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={cn(inputClass, "h-9 text-[12.5px]")}
                            value={row.description}
                            onChange={(event) => patchRow(setRows, index, { description: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={cn(inputClass, "h-9 text-right text-[12.5px]")}
                            value={row.debit}
                            onChange={(event) => patchRow(setRows, index, { debit: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={cn(inputClass, "h-9 text-right text-[12.5px]")}
                            value={row.credit}
                            onChange={(event) => patchRow(setRows, index, { credit: event.target.value })}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-slate-500">
                          {row.needsReview || !row.valid
                            ? row.warning ?? "Needs review"
                            : row.duplicate
                              ? "Possible duplicate"
                              : "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.04] px-5 py-4 sm:px-6">
          <button type="button" className={secondaryButton} disabled={importing} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={!canImport}
            onClick={async () => {
              setImporting(true);
              setError(null);
              const result = await confirmBankStatementImportAction({
                accountId,
                includeDuplicates,
                rows: rows.map((row) => ({
                  transactionDate: row.transactionDate,
                  reference: row.reference,
                  description: row.description,
                  debit: row.debit,
                  credit: row.credit,
                })),
              });
              setImporting(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onImported(result.count);
            }}
          >
            {importing ? "Importing…" : "Import Transactions"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function patchRow(
  setRows: React.Dispatch<React.SetStateAction<StatementPreviewRow[]>>,
  index: number,
  patch: Partial<StatementPreviewRow>,
) {
  setRows((current) => {
    const next = [...current];
    next[index] = {
      ...assessStatementRow({ ...next[index], ...patch }),
      duplicate: next[index].duplicate,
    };
    return next;
  });
}

export function formatImportedCount(count: number) {
  return `Imported ${count} statement transaction${count === 1 ? "" : "s"}.`;
}
