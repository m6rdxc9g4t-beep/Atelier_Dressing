// Rejoue les migrations Supabase sur PGlite (Postgres en WASM) avec de petites
// simulations de Supabase (auth, rôles, temps réel, stockage), puis teste RLS,
// déclencheurs et statistiques.
// Usage : npm test (dans backend/tests)
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const dir = process.argv[2] ?? new URL("../supabase/migrations/", import.meta.url).pathname;
const db = new PGlite();
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
  alter default privileges in schema public grant all on functions to authenticated, anon, service_role;
  create publication supabase_realtime;
  insert into auth.users values ('${A}'), ('${B}');

  -- Stockage Supabase (simplifié)
  create schema storage;
  grant usage on schema storage to authenticated, anon;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant execute on function storage.foldername(text) to authenticated;
  grant all on storage.objects to authenticated;
  alter table storage.objects enable row level security;
`);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8"));
  console.log("  ✓", f);
}

async function en(user, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

// --- Vêtements de A
const [jean] = await en(A, `insert into vetements (nom, categorie, couleurs, saisons, prix)
  values ('Jean brut', 'bas', '[{"nom":"Denim","hex":"#4a6a91"}]', '{automne,hiver}', 90) returning id, user_id, calage`);
assert.equal(jean.user_id, A, "user_id rempli par défaut");
assert.deepEqual(jean.calage, { echelle: 1, dx: 0, dy: 0 });
const [tshirt] = await en(A, `insert into vetements (nom, categorie) values ('T-shirt blanc', 'haut') returning id`);
console.log("✓ vêtements créés avec les valeurs par défaut");

// --- Contraintes
await assert.rejects(en(A, `insert into vetements (nom, categorie) values ('?', 'chaussette')`), /check/);
await assert.rejects(en(A, `insert into vetements (nom, saisons) values ('?', '{mousson}')`), /check/);
await assert.rejects(en(A, `insert into vetements (nom, chaleur) values ('?', 9)`), /check/);
console.log("✓ catégories, saisons et chaleur contrôlées");

// --- RLS : B ne voit rien de A et ne peut rien écrire chez A
assert.equal((await en(B, "select count(*)::int n from vetements"))[0].n, 0);
await assert.rejects(en(B, `insert into vetements (user_id, nom) values ('${A}', 'intrus')`), /row-level security/);
const maj = await en(B, `update vetements set nom = 'piraté' where id = '${jean.id}' returning id`);
assert.equal(maj.length, 0);
console.log("✓ RLS : chaque compte ne voit et ne modifie que ses pièces");

// --- Tenue, journal, statistiques
const [tenue] = await en(A, `insert into tenues (nom, pieces, occasion) values ('Basique', array['${jean.id}', '${tshirt.id}']::uuid[], 'quotidien') returning id`);
await en(A, `insert into ports (porte_le, tenue_id, pieces) values ('2026-10-01', '${tenue.id}', array['${jean.id}', '${tshirt.id}']::uuid[]), ('2026-10-20', null, array['${jean.id}']::uuid[])`);
const stats = await en(A, `select id, nb_ports, dernier_port::text, cout_par_port::float from vetements_stats where id = '${jean.id}'`);
assert.deepEqual(stats[0], { id: jean.id, nb_ports: 2, dernier_port: "2026-10-20", cout_par_port: 45 });
assert.equal((await en(B, "select count(*)::int n from vetements_stats"))[0].n, 0);
console.log("✓ statistiques : 2 ports, dernière sortie, coût par port (vue en security_invoker)");

// --- Suppression : la pièce sort des tenues, le journal reste
await en(A, `delete from vetements where id = '${tshirt.id}'`);
const [t2] = await en(A, `select pieces from tenues where id = '${tenue.id}'`);
assert.deepEqual(t2.pieces, [jean.id]);
assert.equal((await en(A, "select count(*)::int n from ports"))[0].n, 2);
await en(A, `delete from tenues where id = '${tenue.id}'`);
assert.equal((await en(A, "select count(*)::int n from ports where tenue_id is null"))[0].n, 2);
console.log("✓ une pièce supprimée sort des tenues ; une tenue supprimée laisse le journal");

// --- Horodatage
const [avant] = await en(A, `select maj_le from vetements where id = '${jean.id}'`);
await new Promise((r) => setTimeout(r, 20));
await en(A, `update vetements set favori = true where id = '${jean.id}'`);
const [apres] = await en(A, `select maj_le from vetements where id = '${jean.id}'`);
assert.ok(apres.maj_le > avant.maj_le);
console.log("✓ maj_le mis à jour à chaque modification");

// --- Profil
await en(A, `insert into profils (prenom, avatar) values ('François', '{"morphologie":"masculine","taille_cm":180}')`);
assert.equal((await en(B, "select count(*)::int n from profils"))[0].n, 0);
await en(A, `insert into profils (prenom, avatar) values ('François', '{"taille_cm":181}') on conflict (user_id) do update set avatar = excluded.avatar`);
assert.equal((await en(A, "select avatar->>'taille_cm' t from profils"))[0].t, "181");
console.log("✓ profil du mannequin : un par compte, privé");

// --- Stockage : chacun son dossier
await en(A, `insert into storage.objects (bucket_id, name) values ('dressing', '${A}/jean.webp')`);
await assert.rejects(en(A, `insert into storage.objects (bucket_id, name) values ('dressing', '${B}/vol.webp')`), /row-level security/);
assert.equal((await en(B, "select count(*)::int n from storage.objects"))[0].n, 0);
assert.equal((await db.query("select public from storage.buckets where id = 'dressing'")).rows[0].public, false);
const seau = (await db.query("select allowed_mime_types, file_size_limit from storage.buckets where id = 'dressing'")).rows[0];
assert.ok(seau.allowed_mime_types.includes("model/gltf-binary"));
assert.equal(Number(seau.file_size_limit), 26214400);
console.log("✓ bucket : modèles 3D GLB acceptés (25 Mo)");
console.log("✓ photos : bucket privé, un dossier par compte");

// --- Temps réel
const pub = await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1");
assert.deepEqual(pub.rows.map((r) => r.tablename), ["essayages", "ia_demandes", "ports", "profils", "tenues", "vetements"]);
console.log("✓ temps réel : vêtements, tenues, journal, profil, essayages et demandes d'IA publiés");

// --- Relais Claude : l'iPhone dépose, le Mac prend (une seule fois), répond
const [dem] = await en(A, `insert into ia_demandes (tache, entree) values ('tenues', '{"dressing":"x"}') returning id, statut, modele`);
assert.equal(dem.statut, "en_attente");
assert.equal(dem.modele, "sonnet");
const prise = await en(A, `update ia_demandes set statut = 'en_cours' where id = '${dem.id}' and statut = 'en_attente' returning id`);
const deuxieme = await en(A, `update ia_demandes set statut = 'en_cours' where id = '${dem.id}' and statut = 'en_attente' returning id`);
assert.equal(prise.length, 1);
assert.equal(deuxieme.length, 0, "un seul Mac prend la demande");
assert.equal((await en(B, "select count(*)::int n from ia_demandes"))[0].n, 0);
await assert.rejects(en(A, `insert into ia_demandes (tache) values ('pirater')`), /check/);
await assert.rejects(en(A, `insert into ia_demandes (tache, modele) values ('tenues', 'gpt')`), /check/);
await en(A, `insert into ia_relais (appareil, claude_ok) values ('Mac · ab12', true) on conflict (user_id, appareil) do update set vu_le = now()`);
assert.equal((await en(B, "select count(*)::int n from ia_relais"))[0].n, 0);
console.log("✓ relais Claude : demandes privées, prises une seule fois, Mac signalé");

// --- Essayages
await en(A, `insert into essayages (pieces, image, moteur) values (array['${jean.id}']::uuid[], 'essai-1.jpg', 'flux-2-pro')`);
assert.equal((await en(B, "select count(*)::int n from essayages"))[0].n, 0);
await en(A, "update essayages set modele_3d = 'essai-1.glb'");
assert.equal((await en(A, "select modele_3d from essayages"))[0].modele_3d, "essai-1.glb");
await assert.rejects(en(B, `insert into essayages (user_id, image) values ('${A}', 'x.jpg')`), /row-level security/);
console.log("✓ essayages : privés, un par génération");

console.log("\nTous les tests du backend passent.");
