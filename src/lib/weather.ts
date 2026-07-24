// Zero-key weather via open-meteo. Falls back gracefully; caches for 1h.
export type Weather = {
  temperatureF: number;
  condition: string;
  label: string;
  updatedAt: number;
  source: "geo" | "cache" | "manual";
};

const CACHE_KEY = "drip.weather.v1";
const TTL_MS = 60 * 60 * 1000;

const WMO: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  61: "rain",
  63: "rain",
  65: "heavy rain",
  71: "snow",
  73: "snow",
  75: "heavy snow",
  80: "showers",
  81: "showers",
  82: "showers",
  95: "thunder",
  96: "thunder",
  99: "thunder",
};

export function readCachedWeather(): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as Weather;
    if (Date.now() - w.updatedAt > TTL_MS) return null;
    return { ...w, source: "cache" };
  } catch {
    return null;
  }
}

function writeCache(w: Weather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {
    /* ignore quota */
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`,
    );
    const j = (await r.json()) as { results?: { name?: string; admin1?: string }[] };
    const hit = j.results?.[0];
    if (hit?.name) return hit.admin1 ? `${hit.name}, ${hit.admin1}` : hit.name;
  } catch {
    /* ignore */
  }
  return `${lat.toFixed(1)}, ${lon.toFixed(1)}`;
}

export async function fetchWeatherByCoords(lat: number, lon: number): Promise<Weather> {
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`,
  );
  if (!r.ok) throw new Error("Weather lookup failed");
  const j = (await r.json()) as { current?: { temperature_2m: number; weather_code: number } };
  if (!j.current) throw new Error("No weather data");
  const label = await reverseGeocode(lat, lon);
  const w: Weather = {
    temperatureF: Math.round(j.current.temperature_2m),
    condition: WMO[j.current.weather_code] ?? "clear",
    label,
    updatedAt: Date.now(),
    source: "geo",
  };
  writeCache(w);
  return w;
}

export function getGeolocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.message || "Location denied")),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export async function detectWeather(): Promise<Weather> {
  const { lat, lon } = await getGeolocation();
  return fetchWeatherByCoords(lat, lon);
}
