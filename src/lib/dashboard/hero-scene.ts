import type { WeatherCategory } from "@/lib/weather";

export type Daypart = "morning" | "afternoon" | "evening" | "night";

export type HeroSceneId =
  | "morningClear"
  | "morningRain"
  | "afternoonClear"
  | "afternoonRain"
  | "evening"
  | "nightClear"
  | "nightRain"
  | "cloudy"
  | "fallback";

export const HERO_SCENES: Record<HeroSceneId, string> = {
  morningClear: "/images/dashboard/hero/morning-clear.jpg",
  morningRain: "/images/dashboard/hero/morning-rain.jpg",
  afternoonClear: "/images/dashboard/hero/afternoon-clear.jpg",
  afternoonRain: "/images/dashboard/hero/afternoon-rain.jpg",
  evening: "/images/dashboard/hero/evening.jpg",
  nightClear: "/images/dashboard/hero/night-clear.jpg",
  nightRain: "/images/dashboard/hero/night-rain.jpg",
  cloudy: "/images/dashboard/hero/cloudy.jpg",
  fallback: "/images/dashboard/hero/default.jpg",
};

const WET = new Set<WeatherCategory>(["RAIN", "STORM"]);
const OVERCAST = new Set<WeatherCategory>(["CLOUDY", "FOG"]);

export function hourInTimeZone(date: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(date),
  );
  return Number.isFinite(hour) ? hour : 12;
}

export function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

export function resolveHeroScene({
  daypart,
  weather,
}: {
  daypart: Daypart;
  weather: WeatherCategory | null;
}): HeroSceneId {
  if (daypart === "evening") return "evening";

  if (weather == null) {
    if (daypart === "morning") return "morningClear";
    if (daypart === "afternoon") return "afternoonClear";
    return "nightClear";
  }

  if (WET.has(weather)) {
    if (daypart === "morning") return "morningRain";
    if (daypart === "afternoon") return "afternoonRain";
    return "nightRain";
  }

  if (OVERCAST.has(weather) && (daypart === "morning" || daypart === "afternoon")) {
    return "cloudy";
  }

  if (daypart === "morning") return "morningClear";
  if (daypart === "afternoon") return "afternoonClear";
  return "nightClear";
}

export function heroSceneSrc(scene: HeroSceneId) {
  return HERO_SCENES[scene] ?? HERO_SCENES.fallback;
}

export function resolveHeroSceneSrc(weather: WeatherCategory | null, timeZone: string, now = new Date()) {
  return heroSceneSrc(
    resolveHeroScene({
      daypart: daypartForHour(hourInTimeZone(now, timeZone)),
      weather,
    }),
  );
}
