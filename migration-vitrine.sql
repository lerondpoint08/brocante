-- « Ma vitrine » : page décorée de chaque boutique (blocs, notes, stickers, fond) et livre d'or.
-- À lancer une fois dans Supabase (SQL Editor). Sans danger si relancé.

alter table public.vendeurs add column if not exists vitrine jsonb;
alter table public.vendeurs drop constraint if exists vendeurs_vitrine_ck;
alter table public.vendeurs add constraint vendeurs_vitrine_ck check (
  vitrine is null or (jsonb_typeof(vitrine) = 'object' and pg_column_size(vitrine) <= 20000)
);
grant select (vitrine) on public.vendeurs to anon;

create table if not exists public.livre_or (
  id         uuid primary key default gen_random_uuid(),
  vendeur_id uuid not null references public.vendeurs(id) on delete cascade,
  auteur_id  uuid not null references auth.users(id) on delete cascade,
  auteur_nom text not null check (char_length(trim(auteur_nom)) between 1 and 40),
  message    text not null check (char_length(trim(message)) between 2 and 300),
  created_at timestamptz not null default now()
);
create index if not exists livre_or_vendeur_idx on public.livre_or(vendeur_id, created_at desc);
alter table public.livre_or enable row level security;
drop policy if exists "livre lecture" on public.livre_or;
create policy "livre lecture" on public.livre_or for select using (true);
drop policy if exists "livre ecrire" on public.livre_or;
create policy "livre ecrire" on public.livre_or for insert to authenticated
  with check (auteur_id = auth.uid() and vendeur_id <> auth.uid());
drop policy if exists "livre effacer" on public.livre_or;
create policy "livre effacer" on public.livre_or for delete to authenticated
  using (auteur_id = auth.uid() or vendeur_id = auth.uid() or public.est_admin());
grant select on public.livre_or to anon, authenticated;
grant insert, delete on public.livre_or to authenticated;

-- Anti-abus : 3 messages au plus par personne et par boutique sur 24 heures.
create or replace function public.livre_or_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.livre_or where auteur_id = new.auteur_id and vendeur_id = new.vendeur_id
      and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'limite atteinte' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists livre_or_limite on public.livre_or;
create trigger livre_or_limite before insert on public.livre_or for each row execute function public.livre_or_limite();
