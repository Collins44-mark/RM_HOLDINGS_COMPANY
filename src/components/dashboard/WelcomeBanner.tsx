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

      <div className="relative z-10 flex min-h-[188px] flex-col justify-between gap-6 px-6 py-5 sm:px-8 sm:py-6 lg:flex-row">
        <div className="max-w-xl pt-1">
          <p className="text-[15px] font-medium leading-6 text-white/85">
            {greeting},
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-white md:text-[32px]">
            {name}
          </h1>
          <p className="mt-4 text-[15px] font-semibold text-white">
            Welcome to RM Holdings Management System
          </p>
          <p className="mt-1 max-w-md text-[13.5px] font-normal leading-6 text-white/78">
            Monitor and manage all your business units from one place.
          </p>
        </div>

        <div className="flex flex-col items-end justify-between gap-4 self-stretch">
          <div className="text-right">
            <p className="text-[13.5px] font-medium leading-5 text-white/92">{weekday}</p>
            <p className="text-[13.5px] font-medium leading-5 text-white">{date}</p>
          </div>
          <div className="glass-panel flex min-w-[148px] items-center gap-3 rounded-[16px] px-4 py-3">
            <CloudSun className="h-7 w-7 shrink-0 text-white" strokeWidth={1.6} />
            <div>
              <p className="text-[18px] font-semibold leading-none text-white">
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
