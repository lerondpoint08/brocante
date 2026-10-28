-- Aide et suggestions : visiteurs et utilisateurs peuvent écrire au responsable du site depuis le site
-- (une demande d'aide ou une suggestion d'amélioration).
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- Tout le monde peut envoyer un message ; personne ne peut les lire depuis le site (tu les lis dans Table Editor).

create table if not exists public.demandes_aide (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'aide' check (type in ('aide', 'suggestion')),
  message    text not null check (char_length(trim(message)) between 5 and 1000),
  contact    text check (contact is null or char_length(contact) <= 120),
  page       text check (page is null or char_length(page) <= 200),
  langue     text check (langue is null or char_length(langue) <= 8),
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.demandes_aide enable row level security;
drop policy if exists "aide ajout" on public.demandes_aide;
create policy "aide ajout" on public.demandes_aide for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.demandes_aide to anon, authenticated;
