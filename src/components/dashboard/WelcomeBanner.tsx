import { CloudSun } from "lucide-react";
import type { WeatherSnapshot } from "@/lib/weather";

export function WelcomeBanner({
  greeting,
  name,
  weekday,
  date,
  weather,
}: {
  greeting: string;
  name: string;
  weekday: string;
  date: string;
  weather: WeatherSnapshot;
}) {
  return (
    <section className="relative isolate min-h-[188px] overflow-hidden rounded-[20px] border border-white/40 text-white shadow-[0_10px_30px_rgba(12,28,48,0.12)]">
      <img
        src="/images/banner-landscape.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_42%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#071422]/68 via-[#0b1f3a]/32 to-[#071422]/18" />

      <div className="relative z-10 flex min-h-[188px] flex-col justify-between gap-5 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6 lg:flex-row">
        <div className="max-w-xl pt-1">
          <p className="text-[14px] font-medium leading-6 text-white/85 sm:text-[15px]">
            {greeting},
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[28px] md:text-[32px]">
            {name}
          </h1>
          <p className="mt-3 text-[14px] font-semibold text-white sm:mt-4 sm:text-[15px]">
            Welcome to RM Holdings Management System
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
