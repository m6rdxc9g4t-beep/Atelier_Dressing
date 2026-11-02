-- atelier_Dressing — essayages réalistes
-- Une photo générée de toi qui porte des pièces du dressing (photo en pied du
-- profil + photos des pièces, modèle FLUX.2 via la fonction Edge « essayage »).
-- L'image est dans le bucket « dressing » ; on garde les pièces essayées.

create table public.essayages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pieces uuid[] not null default '{}',
  image text not null,
  moteur text not null default '',
  cree_le timestamptz not null default now()
);

create index essayages_user on public.essayages (user_id, cree_le desc);

alter table public.essayages enable row level security;

create policy "essayages : les siens" on public.essayages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.essayages;
