"use client";

import { useState } from "react";
import Link from "next/link";
import { Bus } from "lucide-react";
import { getTransportOverviewAction, type TransportOverviewResult } from "@/actions/school/transport";
import {
  glassPanel,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { transportSelectClass } from "@/lib/school/transport-ui";
import type { TransportPeriod } from "@/lib/school/transport-types";

const PERIODS: Array<[TransportPeriod, string]> = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["year", "This Year"],
];

export function SchoolTransportOverviewPage({ initial }: { initial: TransportOverviewResult }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [period, setPeriod] = useState<TransportPeriod>(ready ? initial.period : "month");
  const [summary, setSummary] = useState(ready ? initial.summary : null);
  const [buses, setBuses] = useState(ready ? initial.buses : []);
  const [routes, setRoutes] = useState(ready ? initial.routes : []);
  const [recent, setRecent] = useState(ready ? initial.recent : []);
  const [enabled, setEnabled] = useState(ready ? initial.enabled : false);

  function load(next: TransportPeriod) {
    void getTransportOverviewAction({ period: next }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setPeriod(result.period);
      setSummary(result.summary);
      setBuses(result.buses);
      setRoutes(result.routes);
      setRecent(result.recent);
      setEnabled(result.enabled);
    });
  }

  const cards = summary
    ? [
        ["Active Buses", String(summary.activeBuses)],
        ["Drivers", String(summary.drivers)],
        ["Active Routes", String(summary.activeRoutes)],
        ["Fuel Cost", formatTzs(summary.fuelCost)],
        ["Maintenance Cost", formatTzs(summary.maintenanceCost)],
        ["Total Transport Cost", formatTzs(summary.totalTransportCost)],
      ]
    : [];

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Transport</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Buses, drivers, routes and vehicle service costs.</p>
        </div>
        <Link href="/school/settings?tab=transport" className={secondaryButton}>
          Open Transport Settings →
        </Link>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {!enabled ? (
        <section className={cn(glassPanel, "px-5 py-4")}>
          <p className="text-[13.5px] text-slate-500">Transport is not enabled yet. Turn it on in School Settings to use pickup and drop-off options.</p>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={transportSelectClass}
          value={period}
          onChange={(event) => {
            const next = event.target.value as TransportPeriod;
            setPeriod(next);
            load(next);
          }}
        >
          {PERIODS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <section key={label} className={cn(glassPanel, "px-4 py-3")}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
          </section>
        ))}
      </div>

      {buses.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Bus} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No school buses registered yet.</h2>
          <p className="text-[13.5px] text-slate-500">Add a bus to start tracking drivers, fuel and maintenance.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className="px-4 py-3">
            <h2 className="text-[15px] font-semibold text-navy">Vehicle overview</h2>
          </div>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Bus", "Driver", "Status", "Fuel Cost", "Maintenance Cost", "Total Cost"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buses.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">
                      {row.registrationNumber}
                      {row.name ? <span className="block text-[12px] font-normal text-slate-500">{row.name}</span> : null}
                    </td>
                    <td className="px-4 py-3">{row.driverName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">{formatTzs(row.fuelCost)}</td>
                    <td className="px-4 py-3">{formatTzs(row.maintenanceCost)}</td>
                    <td className="px-4 py-3">{formatTzs(row.fuelCost + row.maintenanceCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {routes.length ? (
        <section className={glassPanel}>
          <div className="px-4 py-3">
            <h2 className="text-[15px] font-semibold text-navy">Routes</h2>
          </div>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Route", "Price", "Assigned Bus", "Driver", "Status"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3">{formatTzs(row.price)}</td>
                    <td className="px-4 py-3">{row.busRegistration || "—"}</td>
                    <td className="px-4 py-3">{row.driverName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {recent.length ? (
        <section className={glassPanel}>
          <div className="px-4 py-3">
            <h2 className="text-[15px] font-semibold text-navy">Recent service</h2>
          </div>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Bus", "Type", "Description", "Cost"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{row.recordedOn}</td>
                    <td className="px-4 py-3">{row.busRegistration}</td>
                    <td className="px-4 py-3">{row.kind === "fuel" ? "Fuel" : "Maintenance"}</td>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{formatTzs(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
