-- atelier_Dressing — stockage des photos
-- Bucket privé « dressing » : photos détourées (WebP / PNG transparents), photos
-- d'origine (JPEG) et photo du visage du mannequin. Chaque compte lit et écrit
-- uniquement dans son dossier : <user_id>/<clé>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dressing', 'dressing', false, 10485760, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "photos : lire les siennes" on storage.objects
  for select to authenticated
  using (bucket_id = 'dressing' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : ajouter les siennes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dressing' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : remplacer les siennes" on storage.objects
  for update to authenticated
  using (bucket_id = 'dressing' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'dressing' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : supprimer les siennes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dressing' and (storage.foldername(name))[1] = (select auth.uid())::text);
