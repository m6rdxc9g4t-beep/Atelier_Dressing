// atelier_Dressing — photos d'une pièce depuis le lien de la boutique où tu l'as achetée
//
// { url }   → { titre, images: [adresses des photos du produit] }
// { image } → { media_type, data } (la photo elle-même, en base64)
//
// Le navigateur ne peut pas lire la page d'une boutique (CORS) : cette fonction le fait.
// Elle cherche les photos du produit dans les données structurées (JSON-LD « Product »),
// les balises Open Graph et les images de la page. Adresses publiques en https seulement.
// L'appel exige un utilisateur connecté (JWT vérifié par Supabase).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAVIGATEUR = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};
const PAGE_MAX = 6_000_000;
const IMAGE_MAX = 10_000_000;

function erreur(message: string, status: number) {
  return Response.json({ erreur: message }, { status, headers: CORS });
}

/** Adresse publique en https (pas de machine locale ni de réseau privé). */
function adresseAutorisee(brut: string): URL | null {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // pas d'adresse IP brute
  return u;
}

async function lireBorne(r: Response, max: number): Promise<Uint8Array> {
  const lecteur = r.body?.getReader();
  if (!lecteur) return new Uint8Array();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await lecteur.cancel();
      throw new Error("Fichier trop lourd");
    }
    morceaux.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const m of morceaux) {
    out.set(m, o);
    o += m.length;
  }
  return out;
}

const decoder = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u002F/g, "/");

/** Toutes les images d'un nœud JSON-LD (chaîne, tableau, ImageObject). */
function imagesJsonLd(v: unknown, out: string[]) {
  if (!v) return;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => imagesJsonLd(x, out));
  else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") out.push(o.url);
    else if (typeof o.contentUrl === "string") out.push(o.contentUrl);
  }
}

function produits(v: unknown, out: Record<string, unknown>[]) {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach((x) => produits(x, out));
  const o = v as Record<string, unknown>;
  const type = o["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product")) || type === "ProductGroup") out.push(o);
  if (o["@graph"]) produits(o["@graph"], out);
  if (o.hasVariant) produits(o.hasVariant, out);
}

/** Photos du produit trouvées dans la page, les plus probables d'abord. */
export function extrairePhotos(html: string, base: URL): { titre: string; images: string[] } {
  const trouvees: string[] = [];
  let titre = "";
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const liste: Record<string, unknown>[] = [];
      produits(JSON.parse(m[1].trim()), liste);
      for (const p of liste) {
        if (!titre && typeof p.name === "string") titre = p.name;
        imagesJsonLd(p.image, trouvees);
      }
    } catch {
      /* JSON-LD mal formé */
    }
  }
  const meta = (nom: string) =>
    [...html.matchAll(new RegExp(`<meta[^>]+(?:property|name)=["']${nom}["'][^>]*content=["']([^"']+)["']`, "gi"))].map((x) => x[1]);
  trouvees.push(...meta("og:image"), ...meta("og:image:secure_url"), ...meta("twitter:image"));
  if (!titre) titre = meta("og:title")[0] ?? (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\s(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      // Le candidat le plus large
      const cand = srcset
        .split(",")
        .map((c) => c.trim().split(/\s+/))
        .map(([u, t]) => ({ u, w: parseInt(t ?? "0") || 0 }))
        .sort((a, b) => b.w - a.w)[0];
      if (cand?.u) trouvees.push(cand.u);
    }
    const src = tag.match(/\s(?:data-src|data-zoom-image|data-large|src)=["']([^"']+)["']/i)?.[1];
    if (src) trouvees.push(src);
  }
  const vues = new Set<string>();
  const images: string[] = [];
  for (const brut of trouvees) {
    let u: URL;
    try {
      u = new URL(decoder(brut).replace(/^\/\//, "https://"), base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    u.protocol = "https:";
    const s = u.toString();
    if (/\.(svg|gif)(\?|$)/i.test(s) || /(logo|icon|sprite|favicon|placeholder|pixel|badge|payment|flag)/i.test(s)) continue;
    const cle = u.origin + u.pathname;
    if (vues.has(cle)) continue;
    vues.add(cle);
    images.push(s);
    if (images.length >= 24) break;
  }
  return { titre: decoder(titre).slice(0, 120), images };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);
  if (!req.headers.get("Authorization")) return erreur("Connexion requise", 401);
  try {
    const d = (await req.json()) as { url?: string; image?: string };
    if (d.image) {
      const u = adresseAutorisee(d.image);
      if (!u) return erreur("Adresse de photo refusée.", 400);
      const r = await fetch(u, { headers: { ...NAVIGATEUR, Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!r.ok || !/^image\/(jpeg|png|webp|avif)$/.test(type)) return erreur("Cette photo n'a pas pu être récupérée.", 502);
      const octets = await lireBorne(r, IMAGE_MAX);
      let bin = "";
      for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      return Response.json({ media_type: type, data: btoa(bin) }, { headers: CORS });
    }
    const u = adresseAutorisee(d.url ?? "");
    if (!u) return erreur("Colle l'adresse complète de la page du produit (https://…).", 400);
    const r = await fetch(u, { headers: { ...NAVIGATEUR, Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return erreur(`La boutique refuse la lecture de la page (${r.status}). Enregistre les photos depuis ton navigateur et importe-les.`, 502);
    const html = new TextDecoder().decode(await lireBorne(r, PAGE_MAX));
    const res = extrairePhotos(html, new URL(r.url || u.toString()));
    if (!res.images.length) return erreur("Aucune photo de produit trouvée sur cette page.", 404);
    return Response.json(res, { headers: CORS });
  } catch (e) {
    console.error(e);
    return erreur((e as Error).message === "Fichier trop lourd" ? "Fichier trop lourd." : "La page n'a pas pu être lue.", 500);
  }
});
