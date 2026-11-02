-- atelier_Dressing — relais Claude (iPhone → Mac)
-- L'iPhone ne peut pas lancer la CLI Claude Code. Il dépose sa demande d'IA dans
-- « ia_demandes » ; l'app Mac ouverte sur le même compte la prend, la passe à Claude
-- avec l'abonnement de l'utilisateur, et écrit la réponse. « ia_relais » dit quel Mac
-- est ouvert et si Claude y est prêt. Tables de transport : pas de copie dans le mode
-- « Sur cet appareil » (l'app Mac y appelle la CLI directement).

create table public.ia_demandes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tache text not null check (tache in ('vetement', 'tenues', 'silhouette')),
  entree jsonb not null default '{}'::jsonb,
  modele text not null default 'sonnet' check (modele in ('sonnet', 'opus', 'haiku')),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'en_cours', 'fait', 'erreur')),
  resultat jsonb,
  erreur text,
  moteur text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index ia_demandes_user_statut on public.ia_demandes (user_id, statut, cree_le);

create trigger ia_demandes_maj before update on public.ia_demandes
  for each row execute function public.dressing_maj_horodatage();

create table public.ia_relais (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  appareil text not null check (char_length(appareil) between 1 and 60),
  claude_ok boolean not null default false,
  vu_le timestamptz not null default now(),
  primary key (user_id, appareil)
);

alter table public.ia_demandes enable row level security;
alter table public.ia_relais enable row level security;

create policy "demandes d'IA : les siennes" on public.ia_demandes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "relais : les siens" on public.ia_relais
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.ia_demandes;
