"use client";

import { useMemo, useState } from "react";
import { formatTzs } from "@/lib/format/currency";
import type { HistoricalAccountSummary, LedgerSide, RunningLine } from "@/lib/finance/historical-ledgers";

const PAGE_SIZE = 25;

function sideLabel(side: LedgerSide | "even" | null, amount: number) {
  if (!side || side === "even" || amount === 0) return "—";
  return `${formatTzs(amount)} ${side === "debit" ? "Dr" : "Cr"}`;
}

function periodLabel(account: HistoricalAccountSummary) {
  if (!account.periodFrom && !account.periodTo) return "—";
  return `${account.periodFrom ?? "—"} to ${account.periodTo ?? "—"}`;
}

export function HistoricalLedgersPanel({
  accounts,
  lines,
  error,
}: {
  accounts: HistoricalAccountSummary[];
  lines: RunningLine[];
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.importId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [voucherQuery, setVoucherQuery] = useState("");
  const [sort, setSort] = useState<"date" | "voucher" | "debit" | "credit">("date");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const visibleAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter((account) => !needle || account.accountName.toLowerCase().includes(needle) || account.sourceFilename.toLowerCase().includes(needle));
  }, [accounts, query]);

  const selected = visibleAccounts.find((account) => account.importId === accountId) ?? visibleAccounts[0] ?? null;
  const selectedLines = useMemo(() => {
    if (!selected) return [];
    const needle = voucherQuery.trim().toLowerCase();
    const filtered = lines.filter((line) => {
      if (line.importId !== selected.importId) return false;
      if (from && line.date < from) return false;
      if (to && line.date > to) return false;
      if (!needle) return true;
      return [line.particulars, line.voucherType, line.voucherNumber].join(" ").toLowerCase().includes(needle);
    });
    const factor = direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const compare = sort === "voucher"
        ? `${a.voucherType} ${a.voucherNumber}`.localeCompare(`${b.voucherType} ${b.voucherNumber}`)
        : sort === "debit"
          ? a.debit - b.debit
          : sort === "credit"
            ? a.credit - b.credit
            : a.date.localeCompare(b.date) || a.page - b.page || a.line - b.line;
      return compare * factor;
    });
  }, [direction, from, lines, selected, sort, to, voucherQuery]);

  const pageCount = Math.max(1, Math.ceil(selectedLines.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageLines = selectedLines.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function chooseAccount(id: string) {
    setAccountId(id);
    setPage(1);
  }

  if (error) {
    return <p className="rounded-card border border-[color:var(--color-line)] bg-white px-5 py-6 text-[13.5px] text-[#8a5a5a]">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-card border border-[color:var(--color-line)] bg-white shadow-card">
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">Historical Ledgers</h2>
          </div>
          <label className="block min-w-[14rem]">
            <span className="sr-only">Filter by account</span>
            <select
              value={selected?.importId ?? ""}
              onChange={(event) => chooseAccount(event.target.value)}
              className="h-11 w-full rounded-[12px] border border-black/8 bg-white px-3 text-[13.5px] text-navy"
            >
              {visibleAccounts.map((account) => (
                <option key={account.importId} value={account.importId}>{account.accountName}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-[16rem]">
            <span className="sr-only">Search historical accounts</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search accounts"
              className="h-11 w-full rounded-[12px] border border-black/8 bg-white px-3 text-[13.5px] text-navy outline-none focus:border-[#c9d7f5] focus:ring-4 focus:ring-[#3a6fd4]/10"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-[#f4f6fa]">
                {["Account", "Transactions", "Opening balance", "Total debit", "Total credit", "Latest closing balance", "Reporting period"].map((heading) => (
                  <th key={heading} className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => {
                const active = account.importId === selected?.importId;
                return (
                  <tr key={account.importId} className={active ? "bg-[#f3f7ff]" : "hover:bg-[#f8fafc]/80"}>
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => chooseAccount(account.importId)} className="text-left text-[14px] font-semibold text-navy">
                        {account.accountName}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-[13.5px] text-navy">{account.transactionCount}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] text-navy">{account.opening ? sideLabel(account.opening.side, account.opening.amount) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] text-navy">{formatTzs(account.totalDebit)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] text-navy">{formatTzs(account.totalCredit)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] text-navy">{account.closing ? sideLabel(account.closing.side, account.closing.amount) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] text-slate-500">{periodLabel(account)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleAccounts.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-slate-500">No historical accounts match this search.</p> : null}
      </section>

      {selected ? (
        <section className="overflow-hidden rounded-card border border-[color:var(--color-line)] bg-white shadow-card">
          <div className="px-5 py-5">
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">{selected.accountName}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="From date" className="h-11 rounded-[12px] border border-black/8 px-3 text-[13.5px] text-navy" />
              <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="To date" className="h-11 rounded-[12px] border border-black/8 px-3 text-[13.5px] text-navy" />
              <input value={voucherQuery} onChange={(event) => { setVoucherQuery(event.target.value); setPage(1); }} placeholder="Search voucher or particulars" aria-label="Search vouchers" className="h-11 min-w-[16rem] flex-1 rounded-[12px] border border-black/8 px-3 text-[13.5px] text-navy" />
              <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort by" className="h-11 rounded-[12px] border border-black/8 px-3 text-[13.5px] text-navy">
                <option value="date">Date</option>
                <option value="voucher">Voucher</option>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
              <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} aria-label="Sort direction" className="h-11 rounded-[12px] border border-black/8 px-3 text-[13.5px] text-navy">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="bg-[#f4f6fa]">
                  {["Date", "Particulars", "Voucher type", "Voucher number", "Debit", "Credit", "Running balance"].map((heading) => (
                    <th key={heading} className="px-5 py-3.5 text-[12.5px] font-medium text-slate-500">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageLines.map((line) => (
                  <tr key={line.id} className="hover:bg-[#f8fafc]/80">
                    <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] text-navy">{line.date}</td>
                    <td className="px-5 py-3.5 text-[13.5px] text-navy">
                      {line.particulars}
                      {line.kind === "opening_balance" ? <span className="ml-2 text-[12px] text-slate-400">Opening balance</span> : null}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] text-slate-500">{line.voucherType || "—"}</td>
                    <td className="px-5 py-3.5 text-[13.5px] text-slate-500">{line.voucherNumber || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] text-navy">{line.debit ? formatTzs(line.debit) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] text-navy">{line.credit ? formatTzs(line.credit) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] text-navy">{sideLabel(line.runningSide, line.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 text-[13px] text-slate-500">
            <span>{selectedLines.length} rows</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="h-9 rounded-full px-3 ring-1 ring-black/8 disabled:opacity-40">Previous</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="h-9 rounded-full px-3 ring-1 ring-black/8 disabled:opacity-40">Next</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
