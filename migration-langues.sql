-- Demandes de langue : les visiteurs peuvent dire quelle langue les aiderait.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- Tout le monde peut envoyer une demande ; personne ne peut les lire depuis le site (tu les vois dans Table Editor).

create table if not exists public.demandes_langue (
  id         uuid primary key default gen_random_uuid(),
  langue     text not null check (char_length(trim(langue)) between 2 and 60),
  created_at timestamptz not null default now()
);
alter table public.demandes_langue enable row level security;
drop policy if exists "langue ajout" on public.demandes_langue;
create policy "langue ajout" on public.demandes_langue for insert to anon, authenticated with check (true);
grant insert on public.demandes_langue to anon, authenticated;
