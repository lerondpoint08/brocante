-- Organisateurs de brocantes, brocantes annoncées et participation des vendeurs.
-- À lancer une fois dans Supabase (SQL Editor). Sans danger si relancé.

-- ---------- Administrateurs (aucun accès direct depuis le site : seulement via les fonctions ci-dessous)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Organisateurs : demande, puis validation par un administrateur
create table if not exists public.organisateurs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nom        text not null check (char_length(trim(nom)) between 2 and 80),
  ville      text not null check (char_length(trim(ville)) between 2 and 80),
  contact    text check (contact is null or char_length(contact) <= 120),
  message    text check (message is null or char_length(message) <= 500),
  statut     text not null default 'attente' check (statut in ('attente', 'valide', 'refuse')),
  created_at timestamptz not null default now()
);
alter table public.organisateurs enable row level security;

create or replace function public.est_organisateur() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisateurs where user_id = auth.uid() and statut = 'valide');
$$;

drop policy if exists "orga lecture" on public.organisateurs;
create policy "orga lecture" on public.organisateurs for select
  using (statut = 'valide' or user_id = auth.uid());
drop policy if exists "orga demande" on public.organisateurs;
create policy "orga demande" on public.organisateurs for insert to authenticated
  with check (user_id = auth.uid() and statut = 'attente');
drop policy if exists "orga retrait" on public.organisateurs;
create policy "orga retrait" on public.organisateurs for delete to authenticated
  using (user_id = auth.uid() and statut <> 'valide');

-- Le contact et le message de la demande ne sont lisibles que par les administrateurs (fonction ci-dessous).
revoke select on public.organisateurs from anon, authenticated;
grant select (user_id, nom, ville, statut, created_at) on public.organisateurs to anon, authenticated;
grant insert, delete on public.organisateurs to authenticated;

alter table public.organisateurs add column if not exists preuve text check (preuve is null or char_length(preuve) <= 300);
drop function if exists public.admin_demandes();
create function public.admin_demandes()
returns table (user_id uuid, nom text, ville text, contact text, message text, preuve text, statut text, created_at timestamptz, email text)
language sql stable security definer set search_path = public as $$
  select o.user_id, o.nom, o.ville, o.contact, o.message, o.preuve, o.statut, o.created_at, u.email::text
  from public.organisateurs o join auth.users u on u.id = o.user_id
  where public.est_admin()
  order by (o.statut = 'attente') desc, o.created_at desc;
$$;

create or replace function public.admin_decider(cible uuid, decision text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'réservé aux administrateurs'; end if;
  if decision not in ('valide', 'refuse', 'attente') then raise exception 'décision inconnue'; end if;
  update public.organisateurs set statut = decision where user_id = cible;
end $$;

revoke execute on function public.admin_demandes() from public, anon;
revoke execute on function public.admin_decider(uuid, text) from public, anon;
grant execute on function public.admin_demandes() to authenticated;
grant execute on function public.admin_decider(uuid, text) to authenticated;
grant execute on function public.est_admin() to anon, authenticated;
grant execute on function public.est_organisateur() to anon, authenticated;

-- ---------- Brocantes annoncées par les organisateurs validés
create table if not exists public.brocantes (
  id                  uuid primary key default gen_random_uuid(),
  organisateur_id     uuid not null references public.organisateurs(user_id) on delete cascade,
  nom                 text not null check (char_length(trim(nom)) between 2 and 100),
  ville               text not null check (char_length(trim(ville)) between 2 and 80),
  adresse             text check (adresse is null or char_length(adresse) <= 150),
  date                date not null,
  heures              text check (heures is null or char_length(heures) <= 40),
  lien_inscription    text check (lien_inscription is null or (lien_inscription ~ '^https://' and char_length(lien_inscription) <= 300)),
  contact_inscription text check (contact_inscription is null or char_length(contact_inscription) <= 120),
  description         text check (description is null or char_length(description) <= 600),
  created_at          timestamptz not null default now()
);
create index if not exists brocantes_date_idx on public.brocantes(date);
alter table public.brocantes enable row level security;
drop policy if exists "brocantes lecture" on public.brocantes;
create policy "brocantes lecture" on public.brocantes for select using (true);
drop policy if exists "brocantes gestion" on public.brocantes;
create policy "brocantes gestion" on public.brocantes for all to authenticated
  using (organisateur_id = auth.uid() and public.est_organisateur())
  with check (organisateur_id = auth.uid() and public.est_organisateur());
grant select on public.brocantes to anon, authenticated;
grant insert, update, delete on public.brocantes to authenticated;

-- ---------- Participation des vendeurs : demandée par le vendeur, confirmée par l'organisateur
create table if not exists public.participations (
  brocante_id uuid not null references public.brocantes(id) on delete cascade,
  vendeur_id  uuid not null references public.vendeurs(id) on delete cascade,
  statut      text not null default 'attente' check (statut in ('attente', 'confirme', 'refuse')),
  created_at  timestamptz not null default now(),
  primary key (brocante_id, vendeur_id)
);
alter table public.participations enable row level security;

create or replace function public.organise(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brocantes where id = b and organisateur_id = auth.uid());
$$;
grant execute on function public.organise(uuid) to anon, authenticated;

drop policy if exists "participations lecture" on public.participations;
create policy "participations lecture" on public.participations for select
  using (statut = 'confirme' or vendeur_id = auth.uid() or public.organise(brocante_id));
drop policy if exists "participations demande" on public.participations;
create policy "participations demande" on public.participations for insert to authenticated
  with check (vendeur_id = auth.uid() and statut = 'attente');
drop policy if exists "participations decision" on public.participations;
create policy "participations decision" on public.participations for update to authenticated
  using (public.organise(brocante_id)) with check (public.organise(brocante_id));
drop policy if exists "participations retrait" on public.participations;
create policy "participations retrait" on public.participations for delete to authenticated
  using (vendeur_id = auth.uid() or public.organise(brocante_id));
grant select on public.participations to anon, authenticated;
grant insert, update, delete on public.participations to authenticated;

-- ---------- Une participation confirmée s'ajoute toute seule aux marchés du vendeur
alter table public.marches add column if not exists brocante_id uuid references public.brocantes(id) on delete cascade;
create unique index if not exists marches_brocante_uniq on public.marches(vendeur_id, brocante_id) where brocante_id is not null;

create or replace function public.sync_participation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.statut <> 'confirme') then
    delete from public.marches where brocante_id = old.brocante_id and vendeur_id = old.vendeur_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.statut = 'confirme' then
    insert into public.marches (vendeur_id, nom, date, heures, lieu, brocante_id)
    select new.vendeur_id, left(b.nom, 80), b.date, b.heures,
           left(concat_ws(', ', nullif(trim(b.adresse), ''), b.ville), 100), b.id
    from public.brocantes b where b.id = new.brocante_id
    on conflict (vendeur_id, brocante_id) where brocante_id is not null do nothing;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists participations_sync on public.participations;
create trigger participations_sync after insert or update or delete on public.participations
  for each row execute function public.sync_participation();

create or replace function public.sync_brocante() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.marches set nom = left(new.nom, 80), date = new.date, heures = new.heures,
         lieu = left(concat_ws(', ', nullif(trim(new.adresse), ''), new.ville), 100)
  where brocante_id = new.id;
  return new;
end $$;
drop trigger if exists brocantes_sync on public.brocantes;
create trigger brocantes_sync after update on public.brocantes
  for each row execute function public.sync_brocante();

-- ---------- Premier administrateur : remplacez l'adresse par la vôtre puis lancez cette ligne une fois.
-- insert into public.admins (user_id) select id from auth.users where email = 'votre@adresse' on conflict do nothing;
