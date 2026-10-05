"use client";

import { useEffect, useState } from "react";
import { CloudSun } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useT } from "@/components/i18n/LocaleProvider";
import { resolveHeroSceneSrc } from "@/lib/dashboard/hero-scene";
import type { WeatherSnapshot } from "@/lib/weather";

function HeroBackground({ src }: { src: string }) {
  const [active, setActive] = useState(src);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const incoming = src === active ? null : src;
  const incomingVisible = incoming !== null && readySrc === incoming;

  useEffect(() => {
    if (!incoming) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      requestAnimationFrame(() => setReadySrc(incoming));
    };
    image.src = incoming;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [incoming]);

  return (
    <>
      <img
        src={active}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_42%]"
      />
      {incoming ? (
        <img
          src={incoming}
          alt=""
          onTransitionEnd={() => {
            if (!incomingVisible) return;
            setActive(incoming);
            setReadySrc(null);
          }}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_42%] transition-opacity duration-[450ms] ease-out ${
            incomingVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </>
  );
}

export function WelcomeBanner({
  greeting,
  name,
  weekday,
  date,
  weather,
  timeZone,
}: {
  greeting: string;
  name: string;
  weekday: string;
  date: string;
  weather: WeatherSnapshot;
  timeZone: string;
}) {
  const { user } = useAuth();
  const t = useT();
  const displayName = user?.name ?? name;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const heroSrc = resolveHeroSceneSrc(weather.condition, timeZone, new Date(nowTick));

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative isolate min-h-[188px] overflow-hidden rounded-[20px] border border-white/40 text-white shadow-[0_10px_30px_rgba(12,28,48,0.12)]">
      <HeroBackground src={heroSrc} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#071422]/68 via-[#0b1f3a]/32 to-[#071422]/18" />

      <div className="relative z-10 flex min-h-[188px] flex-col justify-between gap-5 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6 lg:flex-row">
        <div className="max-w-xl pt-1">
          <p className="text-[14px] font-medium leading-6 text-white/85 sm:text-[15px]">
            {greeting},
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[28px] md:text-[32px]">
            {displayName}
          </h1>
          <p className="mt-3 text-[14px] font-semibold text-white sm:mt-4 sm:text-[15px]">
            {t("dashboard.welcome")}
          </p>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 self-stretch sm:items-end">
          <div className="text-left sm:text-right">
            <p className="text-[13px] font-medium leading-5 text-white/92 sm:text-[13.5px]">{weekday}</p>
            <p className="text-[13px] font-medium leading-5 text-white sm:text-[13.5px]">{date}</p>
          </div>
          <div className="glass-panel flex min-w-0 items-center gap-3 rounded-[16px] px-3 py-2.5 sm:min-w-[148px] sm:px-4 sm:py-3">
            <CloudSun className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" strokeWidth={1.6} />
            <div>
              <p className="text-[16px] font-semibold leading-none text-white sm:text-[18px]">
                {weather.temperatureC}°C
              </p>
              <p className="mt-1 text-[12px] font-normal text-white/80">{weather.location}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
