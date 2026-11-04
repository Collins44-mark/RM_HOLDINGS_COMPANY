import { formatPdfGeneratedAt, formatPdfNumber } from "@/lib/pdf/report-document";
import { businessToday } from "@/lib/property/invoices";
import { presentContracts, todayIso } from "@/lib/property/contracts";
import { presentTenants } from "@/lib/property/tenants";
import { listInvoiceRecords } from "@/lib/property/invoice-write";
import { listHallRecords } from "@/lib/property/hall-write";
import { listExpenseRecords } from "@/lib/property/expense-write";
import { REPORT_MODULES, REPORT_TYPES, type ReportPayload } from "@/lib/property/report-types";

function money(amount: number) {
  return `TZS ${formatPdfNumber(amount)}`;
}

function day(value: string) {
  const [year, month, date] = String(value || "").slice(0, 10).split("-");
  return year && month && date ? `${date}/${month}/${year}` : "—";
}

function addDays(iso: string, days: number) {
  const [year, month, date] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function inRange(value: string, from: string, to: string) {
  const date = String(value || "").slice(0, 10);
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function overlaps(start: string, end: string, from: string, to: string) {
  if (from && end && end < from) return false;
  if (to && start && start > to) return false;
  return true;
}

function payload(input: Omit<ReportPayload, "generatedAt" | "preparedBy"> & { preparedBy: string }): ReportPayload {
  return { ...input, generatedAt: formatPdfGeneratedAt() };
}

function named(options: { id: string; name: string }[], id: string, fallback: string) {
  if (!id) return fallback;
  return options.find((item) => item.id === id)?.name || fallback;
}

export async function buildPropertyReport(admin: any, buId: string, body: any, preparedBy: string): Promise<{ error: string } | { data: ReportPayload }> {
  const moduleId = String(body.module || "");
  const reportId = String(body.report || "");
  const moduleName = REPORT_MODULES.find((item) => item.id === moduleId)?.name || "";
  const report = REPORT_TYPES[moduleId]?.find((item) => item.id === reportId);
  if (!moduleName || !report) return { error: "Select a report" };
  const from = String(body.from || "").slice(0, 10);
  const to = String(body.to || "").slice(0, 10);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return { error: "Enter a valid date range" };
  if (from && to && to < from) return { error: "End date cannot be before the start date" };
  const propertyId = String(body.propertyId || "");
  const unitId = String(body.unitId || "");
  const tenantId = String(body.tenantId || "");
  const hallId = String(body.hallId || "");
  const category = String(body.category || "");
  const status = String(body.status || "");
  const today = businessToday();
  const period = from || to ? `${from ? day(from) : "Start"} - ${to ? day(to) : "Today"}` : "All dates";

  const propertiesResult = await admin.from("properties").select("id, name, property_type, status, street_address, ward, district, region").eq("business_unit_id", buId).order("name");
  const unitsResult = await admin.from("property_units").select("id, property_id, unit_name, unit_code, occupancy_status, monthly_rent, unit_type").eq("business_unit_id", buId);
  const properties = propertiesResult.data || [];
  const units = unitsResult.data || [];
  if (propertyId && !properties.some((property: any) => property.id === propertyId)) return { error: "Select a property from this business" };
  if (unitId && !units.some((unit: any) => unit.id === unitId && (!propertyId || unit.property_id === propertyId))) return { error: "That unit does not belong to the selected property" };

  const propertyName = new Map(properties.map((property: any) => [property.id, property.name]));
  const filters = [
    `Module: ${moduleName}`,
    propertyId ? `Property: ${propertyName.get(propertyId) || "Property"}` : "",
    unitId ? `Unit: ${units.find((unit: any) => unit.id === unitId)?.unit_name || units.find((unit: any) => unit.id === unitId)?.unit_code || "Unit"}` : "",
    category ? `Category: ${category}` : "",
    status ? `Status: ${status}` : "",
  ].filter(Boolean).join(". ");

  if (moduleId === "properties") {
    if (reportId === "individual" && !propertyId) return { error: "Select a property" };
    const chosen = properties.filter((property: any) => !propertyId || property.id === propertyId);
    if (reportId === "summary") {
      const [invoices, halls, expenses] = await Promise.all([
        listInvoiceRecords(admin, buId),
        listHallRecords(admin, buId),
        listExpenseRecords(admin, buId),
      ]);
      const rows = chosen.map((property: any) => {
        const propertyUnits = units.filter((unit: any) => unit.property_id === property.id);
        const collected = invoices.filter((invoice) => invoice.property_id === property.id && invoice.effective_status !== "Cancelled").reduce((sum, invoice) => sum + invoice.amount_paid, 0)
          + halls.bookings.filter((booking) => booking.property_id === property.id && booking.booking_status !== "Cancelled" && booking.booking_status !== "Rejected").reduce((sum, booking) => sum + booking.amount_paid, 0);
        const spent = expenses.expenses.filter((expense) => expense.property_id === property.id && expense.record_status !== "Cancelled").reduce((sum, expense) => sum + expense.amount_paid, 0);
        return {
          property: property.name,
          units: String(propertyUnits.length),
          occupied: String(propertyUnits.filter((unit: any) => unit.occupancy_status === "Occupied").length),
          vacant: String(propertyUnits.filter((unit: any) => unit.occupancy_status === "Vacant").length),
          collected: money(collected),
          spent: money(spent),
          result: money(collected - spent),
        };
      });
      return { data: payload({ title: report.label, module: moduleName, period, filters: filters || "All properties", preparedBy, summary: [{ label: "Properties", value: String(rows.length) }], columns: [
        { key: "property", label: "Property" }, { key: "units", label: "Units", align: "right" }, { key: "occupied", label: "Occupied", align: "right" }, { key: "vacant", label: "Vacant", align: "right" }, { key: "collected", label: "Collected", align: "right" }, { key: "spent", label: "Expenses paid", align: "right" }, { key: "result", label: "Operating result", align: "right" },
      ], rows }) };
    }
    const rows = chosen.flatMap((property: any) => {
      const propertyUnits = units.filter((unit: any) => unit.property_id === property.id);
      if (reportId === "all") {
        return [{
          property: property.name,
          type: property.property_type || "",
          location: [property.street_address, property.district, property.region].filter(Boolean).join(", ") || "—",
          units: String(propertyUnits.length),
          occupied: String(propertyUnits.filter((unit: any) => unit.occupancy_status === "Occupied").length),
          status: property.status || "",
        }];
      }
      return propertyUnits.map((unit: any) => ({
        property: property.name,
        unit: unit.unit_name || unit.unit_code || "Unit",
        type: unit.unit_type || "",
        status: unit.occupancy_status || "",
        rent: money(Number(unit.monthly_rent || 0)),
      }));
    });
    return { data: payload({
      title: report.label,
      module: moduleName,
      period,
      filters: filters || "All properties",
      preparedBy,
      summary: [{ label: "Records", value: String(rows.length) }],
      columns: reportId === "all"
        ? [{ key: "property", label: "Property" }, { key: "type", label: "Type" }, { key: "location", label: "Location" }, { key: "units", label: "Units", align: "right" }, { key: "occupied", label: "Occupied", align: "right" }, { key: "status", label: "Status" }]
        : [{ key: "property", label: "Property" }, { key: "unit", label: "Unit" }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "rent", label: "Monthly rent", align: "right" }],
      rows,
    }) };
  }

  if (moduleId === "units") {
    const contracts = await admin.from("rental_contracts").select("unit_id, tenant_id, status").eq("business_unit_id", buId);
    const tenants = await admin.from("tenants").select("id, full_name").eq("business_unit_id", buId);
    const tenantName = new Map<string, string>((tenants.data || []).map((tenant: any) => [String(tenant.id), String(tenant.full_name || "")]));
    const occupant = new Map<string, string>();
    for (const contract of contracts.data || []) {
      if (contract.status === "Active" && !occupant.has(contract.unit_id)) occupant.set(contract.unit_id, tenantName.get(contract.tenant_id) || "");
    }
    let rows = units.filter((unit: any) => (!propertyId || unit.property_id === propertyId) && (!unitId || unit.id === unitId));
    if (reportId === "occupied") rows = rows.filter((unit: any) => unit.occupancy_status === "Occupied");
    if (reportId === "vacant") rows = rows.filter((unit: any) => unit.occupancy_status === "Vacant");
    if (status) rows = rows.filter((unit: any) => unit.occupancy_status === status);
    const table = rows.map((unit: any) => ({
      unit: unit.unit_name || unit.unit_code || "Unit",
      property: propertyName.get(unit.property_id) || "",
      status: unit.occupancy_status || "",
      tenant: occupant.get(unit.id) || "—",
      rent: money(Number(unit.monthly_rent || 0)),
    })).sort((a: any, b: any) => `${a.property}${a.unit}`.localeCompare(`${b.property}${b.unit}`));
    return { data: payload({ title: report.label, module: moduleName, period, filters: filters || "All units", preparedBy, summary: [{ label: "Units", value: String(table.length) }], columns: [
      { key: "unit", label: "Unit" }, { key: "property", label: "Property" }, { key: "status", label: "Status" }, { key: "tenant", label: "Tenant" }, { key: "rent", label: "Monthly rent", align: "right" },
    ], rows: table }) };
  }

  const tenantsResult = await admin.from("tenants").select("id, full_name, phone_number, email, status, notes, created_at").eq("business_unit_id", buId);
  const contractsResult = await admin.from("rental_contracts").select("*").eq("business_unit_id", buId);
  const tenantRows = tenantsResult.data || [];
  const contractRows = contractsResult.data || [];
  if (tenantId && !tenantRows.some((tenant: any) => tenant.id === tenantId)) return { error: "Select a tenant from this business" };

  if (moduleId === "tenants") {
    const tenants = presentTenants(tenantRows, contractRows, properties, units).filter((tenant) => !propertyId || tenant.property_id === propertyId);
    if (reportId === "statement") {
      if (!tenantId) return { error: "Select a tenant" };
      const invoices = (await listInvoiceRecords(admin, buId)).filter((invoice) => invoice.tenant_id === tenantId && inRange(invoice.due_date, from, to));
      const active = invoices.filter((invoice) => invoice.effective_status !== "Cancelled");
      const tenant = presentTenants(tenantRows, contractRows, properties, units).find((item) => item.id === tenantId);
      return { data: payload({
        title: report.label,
        module: moduleName,
        period,
        filters: `Tenant: ${tenant?.full_name || "Tenant"}. ${filters}`,
        preparedBy,
        summary: [
          { label: "Invoiced", value: money(active.reduce((sum, invoice) => sum + invoice.total_amount, 0)) },
          { label: "Collected", value: money(active.reduce((sum, invoice) => sum + invoice.amount_paid, 0)) },
          { label: "Outstanding", value: money(active.reduce((sum, invoice) => sum + invoice.balance, 0)) },
        ],
        columns: [
          { key: "invoice", label: "Invoice" }, { key: "property", label: "Property / Unit" }, { key: "due", label: "Due" }, { key: "amount", label: "Amount", align: "right" }, { key: "paid", label: "Collected", align: "right" }, { key: "balance", label: "Balance", align: "right" }, { key: "status", label: "Status" },
        ],
        rows: invoices.map((invoice) => ({
          invoice: invoice.invoice_number,
          property: `${invoice.property_name || "—"} / ${invoice.unit_name || "—"}`,
          due: day(invoice.due_date),
          amount: money(invoice.total_amount),
          paid: money(invoice.amount_paid),
          balance: money(invoice.balance),
          status: invoice.effective_status,
        })),
      }) };
    }
    return { data: payload({ title: report.label, module: moduleName, period, filters: filters || "All tenants", preparedBy, summary: [{ label: "Tenants", value: String(tenants.length) }], columns: [
      { key: "tenant", label: "Tenant" }, { key: "phone", label: "Phone" }, { key: "property", label: "Property" }, { key: "unit", label: "Unit" }, { key: "status", label: "Status" },
    ], rows: tenants.map((tenant) => ({ tenant: tenant.full_name, phone: tenant.phone_number || "—", property: tenant.property_name || "—", unit: tenant.unit_name || "—", status: tenant.status })) }) };
  }

  if (moduleId === "contracts") {
    let contracts = presentContracts(contractRows, tenantRows, properties, units).filter((contract) => (!propertyId || contract.property_id === propertyId) && overlaps(contract.start_date, contract.end_date, from, to));
    if (reportId === "active" || status === "Active") contracts = contracts.filter((contract) => contract.effective_status === "Active");
    if (reportId === "expiring") {
      const until = to || addDays(todayIso(), 30);
      const start = from || todayIso();
      contracts = contracts.filter((contract) => contract.effective_status === "Active" && contract.end_date >= start && contract.end_date <= until);
    }
    if (reportId === "expired") contracts = contracts.filter((contract) => contract.effective_status === "Completed");
    if (status && reportId === "all") contracts = contracts.filter((contract) => contract.effective_status === status);
    const rent = contracts.filter((contract) => contract.effective_status !== "Terminated").reduce((sum, contract) => sum + contract.rent_amount, 0);
    return { data: payload({ title: report.label, module: moduleName, period: reportId === "expiring" && !from && !to ? `Ending by ${day(addDays(todayIso(), 30))}` : period, filters: filters || "All contracts", preparedBy, summary: [{ label: "Contracts", value: String(contracts.length) }, { label: "Monthly rent", value: money(rent) }], columns: [
      { key: "contract", label: "Contract" }, { key: "tenant", label: "Tenant" }, { key: "property", label: "Property / Unit" }, { key: "start", label: "Start" }, { key: "end", label: "End" }, { key: "rent", label: "Rent", align: "right" }, { key: "status", label: "Status" },
    ], rows: contracts.map((contract) => ({ contract: contract.contract_number, tenant: contract.tenant_name || "—", property: `${contract.property_name || "—"} / ${contract.unit_name || "—"}`, start: day(contract.start_date), end: day(contract.end_date), rent: money(contract.rent_amount), status: contract.effective_status })) }) };
  }

  if (moduleId === "invoices") {
    let invoices = (await listInvoiceRecords(admin, buId)).filter((invoice) => (!propertyId || invoice.property_id === propertyId) && (!tenantId || invoice.tenant_id === tenantId) && inRange(invoice.due_date, from, to));
    const statusOf: Record<string, string> = { paid: "Paid", unpaid: "Unpaid", partial: "Partially Paid", overdue: "Overdue" };
    if (statusOf[reportId]) invoices = invoices.filter((invoice) => invoice.effective_status === statusOf[reportId]);
    if (status && reportId === "all") invoices = invoices.filter((invoice) => invoice.effective_status === status);
    const active = invoices.filter((invoice) => invoice.effective_status !== "Cancelled");
    const tenantName = named(tenantRows.map((tenant: any) => ({ id: tenant.id, name: tenant.full_name })), tenantId, "");
    return { data: payload({
      title: report.label,
      module: moduleName,
      period,
      filters: [filters, tenantName ? `Tenant: ${tenantName}` : ""].filter(Boolean).join(". ") || "All invoices",
      preparedBy,
      summary: [
        { label: "Invoiced", value: money(active.reduce((sum, invoice) => sum + invoice.total_amount, 0)) },
        { label: "Collected", value: money(active.reduce((sum, invoice) => sum + invoice.amount_paid, 0)) },
        { label: "Outstanding", value: money(active.reduce((sum, invoice) => sum + invoice.balance, 0)) },
      ],
      columns: [
        { key: "invoice", label: "Invoice" }, { key: "tenant", label: "Tenant" }, { key: "property", label: "Property / Unit" }, { key: "due", label: "Due" }, { key: "amount", label: "Amount", align: "right" }, { key: "paid", label: "Collected", align: "right" }, { key: "balance", label: "Balance", align: "right" }, { key: "status", label: "Status" },
      ],
      rows: invoices.map((invoice) => ({ invoice: invoice.invoice_number, tenant: invoice.tenant_name || "—", property: `${invoice.property_name || "—"} / ${invoice.unit_name || "—"}`, due: day(invoice.due_date), amount: money(invoice.total_amount), paid: money(invoice.amount_paid), balance: money(invoice.balance), status: invoice.effective_status })),
    }) };
  }

  if (moduleId === "halls") {
    const halls = await listHallRecords(admin, buId);
    if (hallId && !halls.halls.some((hall: { id: string }) => hall.id === hallId)) return { error: "Select a hall from this business" };
    let bookings = halls.bookings.filter((booking) => (!hallId || booking.property_id === hallId) && inRange(booking.event_date, from, to));
    if (reportId === "upcoming") bookings = bookings.filter((booking) => booking.event_date >= today && booking.booking_status !== "Cancelled" && booking.booking_status !== "Rejected" && booking.booking_status !== "Completed");
    if (reportId === "confirmed") bookings = bookings.filter((booking) => booking.booking_status === "Confirmed");
    if (reportId === "completed") bookings = bookings.filter((booking) => booking.booking_status === "Completed");
    if (reportId === "cancelled") bookings = bookings.filter((booking) => booking.booking_status === "Cancelled");
    if (status && reportId === "all") bookings = bookings.filter((booking) => booking.booking_status === status);
    const open = bookings.filter((booking) => booking.booking_status !== "Cancelled" && booking.booking_status !== "Rejected");
    return { data: payload({
      title: report.label,
      module: moduleName,
      period,
      filters: [filters, hallId ? `Hall: ${halls.halls.find((hall: { id: string; name: string }) => hall.id === hallId)?.name || "Hall"}` : ""].filter(Boolean).join(". ") || "All halls",
      preparedBy,
      summary: [
        { label: "Bookings", value: String(bookings.length) },
        { label: "Collected", value: money(open.reduce((sum, booking) => sum + booking.amount_paid, 0)) },
        { label: "Outstanding", value: money(open.reduce((sum, booking) => sum + booking.balance, 0)) },
      ],
      columns: [
        { key: "booking", label: "Booking" }, { key: "customer", label: "Customer" }, { key: "hall", label: "Hall" }, { key: "date", label: "Date" }, { key: "amount", label: "Amount", align: "right" }, { key: "paid", label: "Collected", align: "right" }, { key: "balance", label: "Balance", align: "right" }, { key: "status", label: "Status" },
      ],
      rows: bookings.map((booking) => ({ booking: booking.booking_number, customer: booking.customer_name, hall: booking.hall_name || "—", date: day(booking.event_date), amount: money(booking.booking_amount), paid: money(booking.amount_paid), balance: money(booking.balance), status: booking.booking_status })),
    }) };
  }

  const expenses = await listExpenseRecords(admin, buId);
  let rows = expenses.expenses.filter((expense) => (!propertyId || expense.property_id === propertyId) && (!category || expense.category === category) && inRange(expense.expense_date, from, to));
  if (reportId === "paid") rows = rows.filter((expense) => expense.payment_status === "Paid");
  if (reportId === "pending") rows = rows.filter((expense) => expense.payment_status === "Pending" || expense.payment_status === "Partially Paid");
  if (reportId === "overdue") rows = rows.filter((expense) => expense.payment_status === "Overdue");
  if (status && reportId === "all") rows = rows.filter((expense) => expense.payment_status === status);
  if (reportId !== "all") rows = rows.filter((expense) => expense.record_status !== "Cancelled");
  const active = rows.filter((expense) => expense.record_status !== "Cancelled");
  const table = reportId === "by-category"
    ? [...active.reduce((map, expense) => {
        const current = map.get(expense.category) || { recorded: 0, paid: 0, balance: 0, count: 0 };
        current.recorded += expense.amount;
        current.paid += expense.amount_paid;
        current.balance += expense.balance;
        current.count += 1;
        map.set(expense.category, current);
        return map;
      }, new Map<string, { recorded: number; paid: number; balance: number; count: number }>()).entries()].map(([name, value]) => ({ category: name, records: String(value.count), amount: money(value.recorded), paid: money(value.paid), balance: money(value.balance) }))
    : rows.map((expense) => ({ expense: expense.expense_number || "—", title: expense.title, category: expense.category, property: expense.property_name || "—", date: day(expense.expense_date), amount: money(expense.amount), paid: money(expense.amount_paid), balance: money(expense.balance), status: expense.payment_status }));
  return { data: payload({
    title: report.label,
    module: moduleName,
    period,
    filters: filters || "All expenses",
    preparedBy,
    summary: [
      { label: "Recorded", value: money(active.reduce((sum, expense) => sum + expense.amount, 0)) },
      { label: "Paid", value: money(active.reduce((sum, expense) => sum + expense.amount_paid, 0)) },
      { label: "Outstanding", value: money(active.reduce((sum, expense) => sum + expense.balance, 0)) },
    ],
    columns: reportId === "by-category"
      ? [{ key: "category", label: "Category" }, { key: "records", label: "Records", align: "right" }, { key: "amount", label: "Recorded", align: "right" }, { key: "paid", label: "Paid", align: "right" }, { key: "balance", label: "Outstanding", align: "right" }]
      : [{ key: "expense", label: "Expense" }, { key: "title", label: "Title" }, { key: "category", label: "Category" }, { key: "property", label: "Property" }, { key: "date", label: "Date" }, { key: "amount", label: "Amount", align: "right" }, { key: "paid", label: "Paid", align: "right" }, { key: "balance", label: "Balance", align: "right" }, { key: "status", label: "Status" }],
    rows: table,
  }) };
}

export async function listReportOptions(admin: any, buId: string) {
  const [properties, units, tenants, halls] = await Promise.all([
    admin.from("properties").select("id, name, property_type").eq("business_unit_id", buId).order("name"),
    admin.from("property_units").select("id, property_id, unit_name, unit_code").eq("business_unit_id", buId).order("unit_name"),
    admin.from("tenants").select("id, full_name").eq("business_unit_id", buId).order("full_name"),
    admin.from("properties").select("id, name").eq("business_unit_id", buId).eq("property_type", "Hall").order("name"),
  ]);
  return {
    properties: (properties.data || []).map((property: any) => ({ id: property.id, name: property.name })),
    units: (units.data || []).map((unit: any) => ({ id: unit.id, name: unit.unit_name || unit.unit_code || "Unit", property_id: unit.property_id })),
    tenants: (tenants.data || []).map((tenant: any) => ({ id: tenant.id, name: tenant.full_name })),
    halls: (halls.data || []).map((hall: any) => ({ id: hall.id, name: hall.name })),
  };
}
