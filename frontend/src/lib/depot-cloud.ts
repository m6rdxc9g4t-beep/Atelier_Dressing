// Dépôt « Synchronisé » : Supabase (Postgres + RLS + stockage privé des photos),
// temps réel entre le Mac et l'iPhone. Les photos téléchargées sont gardées en
// cache dans IndexedDB : elles s'affichent tout de suite au lancement suivant.

import type { SupabaseClient } from "@supabase/supabase-js";
import { profilVide } from "./depot-local";
import { depuisStockee, ecrire, effacer, lire, ouvrirBase, versStockee, type Depot, type ImageStockee } from "./depot";
import { BUCKET } from "./supabase";
import { maintenant, type Garderobe, type Port, type Profil, type Tenue, type Vetement } from "./types";

const TABLES = ["vetements", "tenues", "ports", "profils"] as const;

export class DepotCloud implements Depot {
  readonly mode = "cloud" as const;
  private cache: Promise<IDBDatabase | null>;
  private sb: SupabaseClient;
  private userId: string;

  constructor(sb: SupabaseClient, userId: string) {
    this.sb = sb;
    this.userId = userId;
    this.cache = ouvrirBase("atelier-dressing-cache", ["images"]).catch(() => null);
  }

  private chemin(cle: string) {
    return `${this.userId}/${cle}`;
  }

  async charger(): Promise<Garderobe> {
    const [v, t, p, pr] = await Promise.all([
      this.sb.from("vetements").select("*").order("cree_le", { ascending: false }),
      this.sb.from("tenues").select("*").order("cree_le", { ascending: false }),
      this.sb.from("ports").select("*").order("porte_le", { ascending: false }).limit(2000),
      this.sb.from("profils").select("*").maybeSingle(),
    ]);
    for (const r of [v, t, p, pr]) if (r.error) throw r.error;
    const vide = profilVide();
    const profil = pr.data as (Profil & { avatar: Partial<Profil["avatar"]> }) | null;
    return {
      vetements: (v.data as Vetement[]).map((x) => ({ ...x, prix: x.prix == null ? null : Number(x.prix) })),
      tenues: t.data as Tenue[],
      ports: p.data as Port[],
      profil: profil
        ? { prenom: profil.prenom ?? "", avatar: { ...vide.avatar, ...profil.avatar }, maj_le: profil.maj_le }
        : vide,
    };
  }

  private async verifier<T extends { error: unknown }>(r: PromiseLike<T>): Promise<void> {
    const { error } = await r;
    if (error) throw error;
  }

  ecrireVetement(v: Vetement) {
    return this.verifier(this.sb.from("vetements").upsert({ ...v, maj_le: maintenant() }));
  }

  async supprimerVetement(id: string) {
    const { data } = await this.sb.from("vetements").select("image, image_originale").eq("id", id).maybeSingle();
    await this.verifier(this.sb.from("vetements").delete().eq("id", id));
    const cles = [data?.image, data?.image_originale].filter((c): c is string => !!c);
    if (cles.length) await Promise.all(cles.map((c) => this.supprimerImage(c)));
  }

  ecrireTenue(t: Tenue) {
    return this.verifier(this.sb.from("tenues").upsert({ ...t, maj_le: maintenant() }));
  }

  supprimerTenue(id: string) {
    return this.verifier(this.sb.from("tenues").delete().eq("id", id));
  }

  ecrirePort(p: Port) {
    return this.verifier(this.sb.from("ports").upsert(p));
  }

  supprimerPort(id: string) {
    return this.verifier(this.sb.from("ports").delete().eq("id", id));
  }

  ecrireProfil(p: Profil) {
    return this.verifier(
      this.sb.from("profils").upsert({ user_id: this.userId, prenom: p.prenom, avatar: p.avatar, maj_le: maintenant() }),
    );
  }

  async ecrireImage(cle: string, b: Blob) {
    const { error } = await this.sb.storage.from(BUCKET).upload(this.chemin(cle), b, {
      upsert: true,
      contentType: b.type || "image/png",
      cacheControl: "31536000",
    });
    if (error) throw error;
    const db = await this.cache;
    if (db) await ecrire(db, "images", cle, await versStockee(b)).catch(() => {});
  }

  async lireImage(cle: string) {
    const db = await this.cache;
    if (db) {
      const local = depuisStockee(await lire<ImageStockee | Blob>(db, "images", cle).catch(() => undefined));
      if (local) return local;
    }
    const { data, error } = await this.sb.storage.from(BUCKET).download(this.chemin(cle));
    if (error || !data) return null;
    if (db) await ecrire(db, "images", cle, await versStockee(data)).catch(() => {});
    return data;
  }

  async supprimerImage(cle: string) {
    await this.sb.storage.from(BUCKET).remove([this.chemin(cle)]);
    const db = await this.cache;
    if (db) await effacer(db, "images", cle).catch(() => {});
  }

  ecouter(surChangement: () => void) {
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const prevenir = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(surChangement, 400);
    };
    let canal = this.sb.channel("dressing-" + this.userId);
    for (const table of TABLES) {
      canal = canal.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${this.userId}` }, prevenir);
    }
    canal.subscribe();
    return () => {
      clearTimeout(minuteur);
      this.sb.removeChannel(canal);
    };
  }
}
