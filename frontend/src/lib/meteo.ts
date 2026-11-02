// Météo du jour (Open-Meteo, sans clé) à partir de la position de l'appareil.
// Gardée une heure en mémoire de session ; en cas de refus ou de panne, l'app
// demande simplement la température à la main.

export interface Meteo {
  temperature: number; // ressentie, arrondie
  pluie: boolean;
  description: string;
}

const CLE = "dressing.meteo";

const CODES: [number[], string, boolean][] = [
  [[0], "Grand soleil", false],
  [[1, 2], "Éclaircies", false],
  [[3], "Couvert", false],
  [[45, 48], "Brouillard", false],
  [[51, 53, 55, 56, 57], "Bruine", true],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Pluie", true],
  [[71, 73, 75, 77, 85, 86], "Neige", true],
  [[95, 96, 99], "Orage", true],
];

export function decrire(code: number): { description: string; pluie: boolean } {
  const c = CODES.find(([codes]) => codes.includes(code));
  return c ? { description: c[1], pluie: c[2] } : { description: "Temps variable", pluie: false };
}

function position(): Promise<GeolocationPosition> {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error("Position indisponible"));
    navigator.geolocation.getCurrentPosition(ok, ko, { timeout: 8000, maximumAge: 3_600_000 });
  });
}

export async function meteoDuJour(): Promise<Meteo> {
  try {
    const c = JSON.parse(sessionStorage.getItem(CLE) ?? "null") as { t: number; m: Meteo } | null;
    if (c && Date.now() - c.t < 3_600_000) return c.m;
  } catch {
    /* rien en cache */
  }
  const p = await position();
  const { latitude: lat, longitude: lon } = p.coords;
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=apparent_temperature,weather_code,precipitation&timezone=auto`,
  );
  if (!r.ok) throw new Error("Météo indisponible");
  const j = (await r.json()) as { current?: { apparent_temperature?: number; weather_code?: number; precipitation?: number } };
  const d = decrire(j.current?.weather_code ?? 2);
  const m: Meteo = {
    temperature: Math.round(j.current?.apparent_temperature ?? 15),
    pluie: d.pluie || (j.current?.precipitation ?? 0) > 0.2,
    description: d.description,
  };
  try {
    sessionStorage.setItem(CLE, JSON.stringify({ t: Date.now(), m }));
  } catch {
    /* tant pis */
  }
  return m;
}
