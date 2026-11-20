"use client";

import { useActionState } from "react";
import { Settings } from "lucide-react";
import { saveSupermarketStoreNameAction } from "@/actions/supermarket/settings";
import { MobileMoneyProvidersForm } from "@/components/settings/MobileMoneyProvidersForm";
import { SaveLabel } from "@/components/ui/SaveMark";
import { RECEIPT_DETAIL_LIMITS, type SupermarketReceiptDetails } from "@/lib/supermarket/receipt-profile";

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

export function SupermarketSettingsPage({
  receipt,
  canEditPayments,
}: {
  receipt: SupermarketReceiptDetails;
  canEditPayments: boolean;
}) {
  const [state, action, pending] = useActionState(saveSupermarketStoreNameAction, null);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-navy sm:text-[22px]">Settings</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-slate-500 sm:text-[13.5px]">
          Receipt heading, closing line, and the mobile money channels used at the till.
        </p>
      </div>
      <section className="rounded-[24px] border border-white/70 bg-white/72 shadow-[0_10px_30px_rgba(15,35,64,0.06)] backdrop-blur-xl">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex text-navy/70">
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Receipt</h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                The store name is printed at the top. Location, mobile, TIN, and email appear under it only when you fill them in. The closing line is printed at the bottom only when you write it.
              </p>
            </div>
          </div>
        </div>
        <form action={action} className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block min-w-0 md:col-span-2">
              <span className="mb-1.5 block text-[13px] text-slate-500">Store name</span>
              <input name="storeName" defaultValue={receipt.storeName} maxLength={RECEIPT_DETAIL_LIMITS.storeName} placeholder="Write the store name" className={fieldClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className="mb-1.5 block text-[13px] text-slate-500">Location</span>
              <input name="location" defaultValue={receipt.location} maxLength={RECEIPT_DETAIL_LIMITS.location} placeholder="Mbagala, Dar es Salaam" className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[13px] text-slate-500">Mobile</span>
              <input name="mobile" defaultValue={receipt.mobile} maxLength={RECEIPT_DETAIL_LIMITS.mobile} placeholder="+255 742 345 678" className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[13px] text-slate-500">TIN</span>
              <input name="tin" defaultValue={receipt.tin} maxLength={RECEIPT_DETAIL_LIMITS.tin} placeholder="123-456-789" className={fieldClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className="mb-1.5 block text-[13px] text-slate-500">Email</span>
              <input name="email" type="email" defaultValue={receipt.email} maxLength={RECEIPT_DETAIL_LIMITS.email} placeholder="shop@example.com" className={fieldClass} />
            </label>
            <label className="block min-w-0 md:col-span-2">
              <span className="mb-1.5 block text-[13px] text-slate-500">Closing line</span>
              <input name="thanks" defaultValue={receipt.thanks} maxLength={RECEIPT_DETAIL_LIMITS.thanks} placeholder="Thank you for shopping with us." className={fieldClass} />
            </label>
          </div>
          {state?.error ? <p className="mt-4 text-sm text-rose-600">{state.error}</p> : null}
          {state?.ok ? <p className="mt-4 text-sm text-emerald-700">Receipt details saved.</p> : null}
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-[14px] bg-navy px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              <SaveLabel busy={pending} failed={Boolean(state?.error)} label="Save" />
            </button>
          </div>
        </form>
      </section>
      <MobileMoneyProvidersForm canEdit={canEditPayments} />
    </div>
  );
}
