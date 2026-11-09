"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { removeOrganizationLogoAction, saveOrganizationLogoAction, saveOrganizationSettingsAction } from "@/actions/organization-settings";
import { readFittedImage } from "@/lib/images/read-image";
import { SaveLabel } from "@/components/ui/SaveMark";
import {
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  timezoneOptionLabel,
} from "@/lib/config/regional";
import { LanguagePreference } from "@/components/i18n/LanguagePreference";
import { useT } from "@/components/i18n/LocaleProvider";
import { useLogoFill } from "@/components/branding/Logo";
import type { OrganizationSettings } from "@/lib/data/organization-settings";

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function GeneralSettingsForm({
  settings,
  canEdit,
}: {
  settings: OrganizationSettings;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState(saveOrganizationSettingsAction, null);
  const timezoneOptions = TIMEZONE_OPTIONS.includes(
    settings.timezone as (typeof TIMEZONE_OPTIONS)[number],
  )
    ? TIMEZONE_OPTIONS
    : ([settings.timezone, ...TIMEZONE_OPTIONS] as string[]);

  const [logo, setLogo] = useState(settings.logoUrl);
  const logoFill = useLogoFill(logo);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);
  useEffect(() => {
    setLogo(settings.logoUrl);
  }, [settings.logoUrl]);

  return (
    <div className="space-y-4">
    <section className="rounded-[24px] border border-white/70 bg-white/72 shadow-[0_10px_30px_rgba(15,35,64,0.06)] backdrop-blur-xl">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex text-navy/70">
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">
              {t("settings.generalTitle")}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              {t("settings.generalSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-4">
          <label
            className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[#3a2a0a] ${logo ? "" : "bg-gradient-to-b from-[#d7b56a] to-[#b48a32] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"} ${canEdit ? "cursor-pointer" : ""}`}
            style={logo ? { backgroundColor: logoFill } : undefined}
          >
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <span className="font-[family-name:var(--font-cormorant)] text-[26px] font-semibold leading-none">RM</span>}
            {canEdit ? (
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setLogoBusy(true);
                  setLogoFailed(false);
                  setLogoError("");
                  try {
                    const image = await readFittedImage(file, 256);
                    const result = await saveOrganizationLogoAction(image);
                    if (result?.error) {
                      setLogoFailed(true);
                      setLogoError(result.error);
                    } else {
                      setLogo(image);
                      router.refresh();
                    }
                  } catch (error) {
                    setLogoFailed(true);
                    setLogoError(error instanceof Error ? error.message : "Could not save the logo.");
                  } finally {
                    setLogoBusy(false);
                  }
                }}
              />
            ) : null}
          </label>
          <div>
            <p className="text-[13px] font-medium text-navy">{t("settings.logo")}</p>
            <p className="text-[12px] text-slate-500">{canEdit ? t("settings.logoHint") : t("settings.readOnly")}</p>
            {logoError ? <p className="text-[12px] text-rose-600">{logoError}</p> : null}
            <div className="mt-1 flex items-center gap-3">
              {canEdit && logo ? (
                <button
                  type="button"
                  disabled={logoBusy}
                  className="text-[12px] font-semibold text-rose-700 disabled:opacity-60"
                  onClick={async () => {
                    setLogoBusy(true);
                    setLogoFailed(false);
                    setLogoError("");
                    const result = await removeOrganizationLogoAction();
                    if (result?.error) {
                      setLogoFailed(true);
                      setLogoError(result.error);
                    } else {
                      setLogo("");
                      router.refresh();
                    }
                    setLogoBusy(false);
                  }}
                >
                  {t("settings.logoRemove")}
                </button>
              ) : null}
              {canEdit ? <span className="inline-flex text-navy"><SaveLabel busy={logoBusy} failed={logoFailed} label="" /></span> : null}
            </div>
          </div>
        </div>
      </div>

      <form action={action} className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] text-slate-500">
              {t("settings.organisationName")}
            </span>
            <input
              name="organisationName"
              defaultValue={settings.organisationName}
              required
              maxLength={120}
              disabled={!canEdit}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] text-slate-500">
              {t("settings.timezone")}
            </span>
            <select
              name="timezone"
              defaultValue={settings.timezone}
              disabled={!canEdit}
              className={fieldClass}
            >
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {timezoneOptionLabel(zone)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] text-slate-500">
              {t("settings.currency")}
            </span>
            <select
              name="currency"
              defaultValue={settings.currency}
              disabled={!canEdit}
              className={fieldClass}
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] text-slate-500">
              {t("settings.languageOrg")}
            </span>
            <select
              name="language"
              defaultValue={settings.language}
              disabled={!canEdit}
              className={fieldClass}
            >
              <option value="en">{t("settings.language.en")}</option>
              <option value="sw">{t("settings.language.sw")}</option>
            </select>
            <span className="mt-1.5 block text-[12px] text-slate-400">{t("settings.languageOrgHint")}</span>
          </label>
        </div>

        {state?.error ? (
          <p className="mt-4 text-sm text-rose-600">{state.error}</p>
        ) : null}
        {state?.ok ? (
          <p className="mt-4 text-sm text-emerald-700">{t("settings.saved")}</p>
        ) : null}
        {!canEdit ? (
          <p className="mt-4 text-sm text-slate-500">{t("settings.readOnly")}</p>
        ) : null}

        {canEdit ? (
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-[14px] bg-navy px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              <SaveLabel busy={pending} failed={Boolean(state?.error)} label={t("common.save")} />
            </button>
          </div>
        ) : null}
      </form>
    </section>
    <LanguagePreference />
    </div>
  );
}
