-- Saisie rapide : les objets créés en rafale restent des brouillons, invisibles des visiteurs, jusqu'à leur validation.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.

alter table public.objets add column if not exists brouillon boolean not null default false;

drop policy if exists "objets lecture" on public.objets;
create policy "objets lecture" on public.objets for select
  using (not brouillon or auth.uid() = vendeur_id);
