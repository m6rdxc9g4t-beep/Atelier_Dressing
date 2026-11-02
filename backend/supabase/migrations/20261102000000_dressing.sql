-- atelier_Dressing — schéma
-- Vêtements et accessoires photographiés, tenues composées, journal de ce qui
-- a été porté, et le profil du mannequin. Chaque compte ne voit que ses données
-- (RLS par user_id). Les photos sont dans le bucket privé « dressing », rangées
-- par compte : <user_id>/<clé>.

-- ---------------------------------------------------------------- Utilitaires

create or replace function public.maj_horodatage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.maj_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- Profil (mannequin)

create table public.profils (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prenom text not null default '',
  -- morphologie, taille_cm, epaules, poitrine, tour_taille, hanches, jambes,
  -- carnation, cheveux_couleur, cheveux_longueur, visage (voir frontend/src/lib/types.ts)
  avatar jsonb not null default '{}'::jsonb,
  maj_le timestamptz not null default now(),
  constraint avatar_objet check (jsonb_typeof(avatar) = 'object')
);

-- ---------------------------------------------------------------- Vêtements

create table public.vetements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null default '',
  categorie text not null default 'autre' check (categorie in (
    'haut', 'bas', 'robe', 'veste', 'chaussures', 'sac', 'chapeau', 'lunettes', 'echarpe', 'bijoux', 'ceinture', 'autre'
  )),
  sous_type text not null default '',
  couleurs jsonb not null default '[]'::jsonb check (jsonb_typeof(couleurs) = 'array'),
  matiere text not null default '',
  motif text not null default 'uni',
  saisons text[] not null default '{}' check (saisons <@ array['printemps', 'ete', 'automne', 'hiver']),
  occasions text[] not null default '{}' check (occasions <@ array['quotidien', 'travail', 'soiree', 'sport', 'ceremonie', 'detente']),
  style text not null default '',
  longueur text check (longueur in ('courte', 'hanches', 'cuisses', 'genoux', 'mollets', 'chevilles')),
  chaleur smallint not null default 2 check (chaleur between 1 and 5),
  marque text not null default '',
  taille text not null default '',
  prix numeric(10, 2) check (prix is null or prix >= 0),
  achete_le date,
  notes text not null default '',
  favori boolean not null default false,
  archive boolean not null default false,
  image text,
  image_originale text,
  -- réglage fin sur le mannequin : { echelle, dx, dy }
  calage jsonb not null default '{"echelle": 1, "dx": 0, "dy": 0}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index vetements_user_categorie on public.vetements (user_id, categorie);

create trigger vetements_maj before update on public.vetements
  for each row execute function public.maj_horodatage();

-- ---------------------------------------------------------------- Tenues

create table public.tenues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null default '',
  pieces uuid[] not null default '{}',
  occasion text check (occasion in ('quotidien', 'travail', 'soiree', 'sport', 'ceremonie', 'detente')),
  saisons text[] not null default '{}' check (saisons <@ array['printemps', 'ete', 'automne', 'hiver']),
  note text not null default '',
  favori boolean not null default false,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index tenues_user on public.tenues (user_id);

create trigger tenues_maj before update on public.tenues
  for each row execute function public.maj_horodatage();

-- ---------------------------------------------------------------- Journal

create table public.ports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  porte_le date not null default current_date,
  tenue_id uuid references public.tenues (id) on delete set null,
  pieces uuid[] not null default '{}',
  note text not null default '',
  cree_le timestamptz not null default now()
);

create index ports_user_date on public.ports (user_id, porte_le desc);

-- Une pièce supprimée disparaît des tenues (le journal garde la trace).
create or replace function public.retirer_des_tenues()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.tenues
     set pieces = array_remove(pieces, old.id)
   where user_id = old.user_id
     and old.id = any (pieces);
  return old;
end;
$$;

create trigger vetements_retirer after delete on public.vetements
  for each row execute function public.retirer_des_tenues();

-- ---------------------------------------------------------------- Statistiques

-- Nombre de ports et dernière sortie de chaque pièce, coût par port.
create view public.vetements_stats
with (security_invoker = true)
as
select
  v.id,
  v.user_id,
  count(p.id)::int as nb_ports,
  max(p.porte_le) as dernier_port,
  case when v.prix is not null and count(p.id) > 0 then round(v.prix / count(p.id), 2) end as cout_par_port
from public.vetements v
left join public.ports p on p.user_id = v.user_id and v.id = any (p.pieces)
group by v.id, v.user_id, v.prix;

-- ---------------------------------------------------------------- Sécurité (RLS)

alter table public.profils enable row level security;
alter table public.vetements enable row level security;
alter table public.tenues enable row level security;
alter table public.ports enable row level security;

create policy "profil : le sien" on public.profils
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "vêtements : les siens" on public.vetements
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tenues : les siennes" on public.tenues
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "journal : le sien" on public.ports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Temps réel

alter publication supabase_realtime add table public.vetements, public.tenues, public.ports, public.profils;
