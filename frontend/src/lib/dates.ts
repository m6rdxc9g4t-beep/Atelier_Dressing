/** Date du jour au format AAAA-MM-JJ, heure locale. */
export function aujourdhui(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

const FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function dateLongue(iso: string): string {
  const s = FORMAT.format(new Date(iso + "T12:00:00"));
  return s[0].toUpperCase() + s.slice(1);
}

export function dateCourte(iso: string): string {
  return COURT.format(new Date(iso + "T12:00:00"));
}

/** « aujourd'hui », « hier », « il y a 12 jours », « jamais ». */
export function depuis(iso: string | undefined, ref = new Date()): string {
  if (!iso) return "jamais portée";
  const j = Math.round((new Date(aujourdhui(ref) + "T12:00:00").getTime() - new Date(iso + "T12:00:00").getTime()) / 86_400_000);
  if (j <= 0) return "portée aujourd'hui";
  if (j === 1) return "portée hier";
  return `portée il y a ${j} jours`;
}

export const euros = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 });
