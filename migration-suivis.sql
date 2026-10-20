-- Suivre des boutiques : chaque personne connectée choisit les boutiques qu'elle veut retrouver en premier.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- Chacun ne voit et ne modifie que ses propres suivis.

create table if not exists public.suivis (
  visiteur_id uuid not null references auth.users(id) on delete cascade,
  vendeur_id  uuid not null references public.vendeurs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (visiteur_id, vendeur_id),
  check (visiteur_id <> vendeur_id)
);
alter table public.suivis enable row level security;
drop policy if exists "suivis lecture" on public.suivis;
drop policy if exists "suivis ajout"   on public.suivis;
drop policy if exists "suivis suppr"   on public.suivis;
create policy "suivis lecture" on public.suivis for select to authenticated using (auth.uid() = visiteur_id);
create policy "suivis ajout"   on public.suivis for insert to authenticated with check (auth.uid() = visiteur_id);
create policy "suivis suppr"   on public.suivis for delete to authenticated using (auth.uid() = visiteur_id);
grant select, insert, delete on public.suivis to authenticated;
