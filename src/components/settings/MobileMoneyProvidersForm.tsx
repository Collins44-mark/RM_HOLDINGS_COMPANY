"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import {
  listMobileMoneyProvidersAction,
  setMobileMoneyProviderActiveAction,
  upsertMobileMoneyProviderAction,
  type PaymentProviderRecord,
} from "@/actions/supermarket/sales";

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10 disabled:cursor-not-allowed disabled:bg-slate-50";

export function MobileMoneyProvidersForm({ canEdit }: { canEdit: boolean }) {
  const [providers, setProviders] = useState<PaymentProviderRecord[] | null>(null);
  const [name, setName] = useState("");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const result = await listMobileMoneyProvidersAction();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setProviders(result.providers);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    void listMobileMoneyProvidersAction().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setProviders([]);
        return;
      }
      setProviders(result.providers);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addProvider() {
    if (!canEdit || saving) return;
    setSaving(true);
    const result = await upsertMobileMoneyProviderAction({ name, paymentNumber, isActive: true });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setPaymentNumber("");
    await refresh();
  }

  async function toggleActive(provider: PaymentProviderRecord) {
    if (!canEdit) return;
    const result = await setMobileMoneyProviderActiveAction({
      id: provider.id,
      isActive: !provider.isActive,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  return (
    <section className="rounded-[24px] border border-white/70 bg-white/72 shadow-[0_10px_30px_rgba(15,35,64,0.06)] backdrop-blur-xl">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex text-navy/70">
            <Smartphone className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Mobile Money</h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              Configure supermarket POS payment channels. Cashiers choose from this list and never type a provider name or number.
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        {canEdit ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="min-w-0">
              <span className="mb-1.5 block text-[13px] text-slate-500">Display name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={fieldClass}
                maxLength={80}
              />
            </label>
            <label className="min-w-0">
              <span className="mb-1.5 block text-[13px] text-slate-500">Payment number</span>
              <input
                value={paymentNumber}
                onChange={(event) => setPaymentNumber(event.target.value)}
                className={fieldClass}
                maxLength={80}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void addProvider()}
                className="h-11 w-full rounded-[14px] bg-navy px-4 text-[13.5px] font-semibold text-white disabled:opacity-60 md:w-auto"
              >
                {saving ? "Saving…" : "Add Provider"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 divide-y divide-black/[0.04]">
          {providers == null ? (
            <p className="py-3 text-[13.5px] text-slate-500">Loading payment channels…</p>
          ) : providers.length === 0 ? (
            <p className="py-3 text-[13.5px] text-slate-500">No Mobile Money providers are configured.</p>
          ) : (
            providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-navy">{provider.label}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">{provider.isActive ? "Active" : "Inactive"}</p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void toggleActive(provider)}
                    className="shrink-0 text-[12.5px] font-medium text-slate-500 hover:text-navy"
                  >
                    {provider.isActive ? "Deactivate" : "Activate"}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
