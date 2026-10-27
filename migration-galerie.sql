-- Galerie : jusqu'à 3 photos supplémentaires par objet (la photo principale reste dans objets.photo_url).
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- Les fichiers restent dans le stockage « photos » ; cette table ne garde que leurs adresses (très léger).

create table if not exists public.objet_photos (
  id uuid primary key default gen_random_uuid(),
  objet_id uuid not null references public.objets(id) on delete cascade,
  vendeur_id uuid not null references public.vendeurs(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists objet_photos_objet_idx on public.objet_photos(objet_id, position);

alter table public.objet_photos enable row level security;
drop policy if exists "photos objet lecture" on public.objet_photos;
drop policy if exists "photos objet ajout"   on public.objet_photos;
drop policy if exists "photos objet suppr"   on public.objet_photos;
create policy "photos objet lecture" on public.objet_photos for select using (true);
create policy "photos objet ajout" on public.objet_photos for insert to authenticated
  with check (auth.uid() = vendeur_id and exists (select 1 from public.objets o where o.id = objet_id and o.vendeur_id = auth.uid()));
create policy "photos objet suppr" on public.objet_photos for delete to authenticated using (auth.uid() = vendeur_id);

grant select on public.objet_photos to anon;
grant select, insert, delete on public.objet_photos to authenticated;

create or replace function public.verifier_nb_photos()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if (select count(*) from public.objet_photos where objet_id = new.objet_id) >= 3 then
    raise exception 'PHOTOS_MAX';
  end if;
  return new;
end;
$fn$;
drop trigger if exists verifier_nb_photos on public.objet_photos;
create trigger verifier_nb_photos before insert on public.objet_photos
  for each row execute function public.verifier_nb_photos();
