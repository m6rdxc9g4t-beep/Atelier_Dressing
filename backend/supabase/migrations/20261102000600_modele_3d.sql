-- atelier_Dressing — modèle 3D des essayages
-- TRELLIS.2 (Hugging Face) tire de la photo d'essayage un modèle 3D texturé
-- (fichier GLB), rangé dans le bucket « dressing » comme les photos.

alter table public.essayages add column if not exists modele_3d text;

-- Le bucket accepte les fichiers GLB, jusqu'à 25 Mo
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg', 'model/gltf-binary'],
    file_size_limit = 26214400
where id = 'dressing';
