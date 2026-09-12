export type WeatherSnapshot = {
  temperatureC: number;
  label: string;
  location: string;
};

const FALLBACK: WeatherSnapshot = {
  temperatureC: 31,
  label: "Partly cloudy",
  location: "Dar es Salaam",
};

const WMO_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  51: "Drizzle",
  61: "Rain",
  71: "Snow",
  80: "Showers",
  95: "Thunderstorm",
};

export async function getMorogoroWeather(): Promise<WeatherSnapshot> {
  try {
    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-6.8278&longitude=37.6612&current=temperature_2m,weather_code",
      { next: { revalidate: 1800 } },
    );
    if (!response.ok) return FALLBACK;
    const data = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temperature = data.current?.temperature_2m;
    const code = data.current?.weather_code ?? 0;
    if (typeof temperature !== "number") return FALLBACK;
    return {
      temperatureC: Math.round(temperature),
      label: WMO_LABELS[code] ?? "Clear",
      location: "Dar es Salaam",
    };
  } catch {
    return FALLBACK;
  }
}
