-- atelier_Dressing — repères d'ajustement posés par l'IA sur la photo de chaque pièce
-- { epaules: { y, gauche, droite }, ceinture: { y, gauche, droite }, ourlet } en fractions
-- de la photo : l'app cale ces points sur les épaules et la taille du mannequin.

alter table public.vetements
  add column ajustement jsonb check (ajustement is null or jsonb_typeof(ajustement) = 'object');
