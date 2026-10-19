-- Ajoute le lieu de chaque brocanteur (ville ou zone).
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
alter table public.vendeurs
  add column if not exists lieu text check (lieu is null or char_length(lieu) <= 80);
