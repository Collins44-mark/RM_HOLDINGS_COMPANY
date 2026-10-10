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
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_38%]"
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
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_38%] transition-opacity duration-[450ms] ease-out ${
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
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[32rem] overflow-hidden sm:h-[36rem] lg:h-[38rem]"
      >
        <HeroBackground src={heroSrc} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#071422]/58 via-[#0b1f3a]/22 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-b from-transparent via-[#eef3f8]/45 to-[#eef3f8]" />
      </div>

      <section className="relative z-10 px-4 pt-[4.75rem] pb-8 text-white sm:px-5 sm:pt-[5.75rem] sm:pb-10 md:px-6 lg:px-7 lg:pt-24">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="max-w-xl pt-1">
            <p className="text-[15px] font-medium leading-6 text-white/90 sm:text-[16px]">
              {greeting},
            </p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[34px] md:text-[38px]">
              {displayName}
            </h1>
            <p className="mt-3 text-[14px] font-semibold text-white sm:mt-4 sm:text-[15px]">
              {t("dashboard.welcome")}
            </p>
            <p className="mt-1 max-w-md text-[13px] font-normal leading-5 text-white/78 sm:text-[13.5px]">
              {t("dashboard.welcomeHint")}
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 self-stretch sm:items-end">
            <div className="text-left sm:text-right">
              <p className="text-[13px] font-medium leading-5 text-white/92">{weekday}</p>
              <p className="text-[13px] font-medium leading-5 text-white">{date}</p>
            </div>
            <div className="flex min-w-0 items-center gap-3 rounded-[18px] border border-white/35 bg-white/18 px-3 py-2.5 shadow-[0_8px_24px_rgba(8,20,40,0.12)] backdrop-blur-md sm:min-w-[148px] sm:px-4 sm:py-3">
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
    </>
  );
}
