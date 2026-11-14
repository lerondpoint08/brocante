-- À coller dans Supabase > SQL Editor, puis cliquer sur "Run".
-- Crée les tables, les règles de sécurité et le dossier de photos.

create table if not exists public.vendeurs (
  id uuid primary key references auth.users(id) on delete cascade,
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,40}$'),
  nom text not null check (char_length(nom) between 2 and 80),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  lieu text check (lieu is null or char_length(lieu) <= 80),
  presentation text check (presentation is null or char_length(presentation) <= 600),
  logo_url text,
  nom_modifie_le timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.objets (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid not null references public.vendeurs(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  categorie text not null default 'Divers' check (char_length(categorie) <= 40),
  prix numeric(8,2) not null check (prix >= 0),
  description text check (description is null or char_length(description) <= 500),
  photo_url text,
  etat text not null default 'Disponible' check (etat in ('Disponible','Réservé','Vendu')),
  present_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.marches (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid not null references public.vendeurs(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 80),
  date date not null,
  heures text check (heures is null or char_length(heures) <= 40),
  lieu text check (lieu is null or char_length(lieu) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists objets_vendeur_idx on public.objets(vendeur_id);
create index if not exists marches_vendeur_idx on public.marches(vendeur_id, date);

-- Sécurité : chacun ne modifie que ses propres données, tout le monde peut les lire.
alter table public.vendeurs enable row level security;
alter table public.objets   enable row level security;
alter table public.marches  enable row level security;

drop policy if exists "vendeurs lecture"  on public.vendeurs;
drop policy if exists "vendeurs ajout"    on public.vendeurs;
drop policy if exists "vendeurs maj"      on public.vendeurs;
create policy "vendeurs lecture" on public.vendeurs for select using (true);
create policy "vendeurs ajout"   on public.vendeurs for insert to authenticated with check (auth.uid() = id);
create policy "vendeurs maj"     on public.vendeurs for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "objets lecture"  on public.objets;
drop policy if exists "objets ajout"    on public.objets;
drop policy if exists "objets maj"      on public.objets;
drop policy if exists "objets suppr"    on public.objets;
create policy "objets lecture" on public.objets for select using (true);
create policy "objets ajout"   on public.objets for insert to authenticated with check (auth.uid() = vendeur_id);
create policy "objets maj"     on public.objets for update to authenticated using (auth.uid() = vendeur_id) with check (auth.uid() = vendeur_id);
create policy "objets suppr"   on public.objets for delete to authenticated using (auth.uid() = vendeur_id);

drop policy if exists "marches lecture"  on public.marches;
drop policy if exists "marches ajout"    on public.marches;
drop policy if exists "marches maj"      on public.marches;
drop policy if exists "marches suppr"    on public.marches;
create policy "marches lecture" on public.marches for select using (true);
create policy "marches ajout"   on public.marches for insert to authenticated with check (auth.uid() = vendeur_id);
create policy "marches maj"     on public.marches for update to authenticated using (auth.uid() = vendeur_id) with check (auth.uid() = vendeur_id);
create policy "marches suppr"   on public.marches for delete to authenticated using (auth.uid() = vendeur_id);

-- Photos : dossier public en lecture, chaque vendeur n'écrit que dans son propre sous-dossier.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;

drop policy if exists "photos lecture"  on storage.objects;
drop policy if exists "photos ajout"    on storage.objects;
drop policy if exists "photos suppr"    on storage.objects;
create policy "photos lecture" on storage.objects for select using (bucket_id = 'photos');
create policy "photos ajout"   on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos suppr"   on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Droits d'accès (au cas où l'exposition automatique des tables serait désactivée).
-- Les règles de sécurité ci-dessus restent le vrai garde-fou.
grant usage on schema public to anon, authenticated;
grant select on public.objets, public.marches to anon;
-- Le numéro WhatsApp n'est lisible que par les personnes connectées.
grant select (id, slug, nom, lieu, presentation, logo_url) on public.vendeurs to anon;
grant select, insert, update, delete on public.vendeurs, public.objets, public.marches to authenticated;

-- Suppression de son propre compte (voir aussi migration-profil.sql pour une base déjà installée).
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- Garde-fous sur le nom de la boutique (voir aussi migration-nom.sql pour une base déjà installée).
create or replace function public.verifier_nom_boutique()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nom := btrim(regexp_replace(new.nom, '\s+', ' ', 'g'));
  if char_length(new.nom) < 2 or char_length(new.nom) > 80 then
    raise exception 'NOM_LONGUEUR';
  end if;
  if new.nom ~* '(https?:|www\.|@|\.(com|fr|net|org|io|xyz|info)\y)' then
    raise exception 'NOM_LIEN';
  end if;
  if new.nom !~ '[A-Za-zÀ-ÿ0-9]' then
    raise exception 'NOM_SYMBOLES';
  end if;
  if lower(new.nom) ~ '(admin|moderat|modérat|support|officiel)' then
    raise exception 'NOM_RESERVE';
  end if;
  if tg_op = 'UPDATE' and new.nom is distinct from old.nom then
    if old.nom_modifie_le is not null and old.nom_modifie_le > now() - interval '7 days' then
      raise exception 'NOM_TROP_RECENT';
    end if;
    new.nom_modifie_le := now();
  end if;
  return new;
end;
$$;

drop trigger if exists verifier_nom_boutique on public.vendeurs;
create trigger verifier_nom_boutique
  before insert or update of nom on public.vendeurs
  for each row execute function public.verifier_nom_boutique();

-- Si cette ligne échoue parce que deux boutiques ont déjà le même nom, renommez l'une des deux puis relancez.
create unique index if not exists vendeurs_nom_unique on public.vendeurs (lower(btrim(nom)));

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

create table if not exists public.ia_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  jour    date not null default current_date,
  nb      int  not null default 0,
  primary key (user_id, jour)
);
alter table public.ia_usage enable row level security;
revoke all on public.ia_usage from anon, authenticated;

create or replace function public.ia_consommer(uid uuid, limite int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare n int;
begin
  insert into public.ia_usage (user_id, jour, nb) values (uid, current_date, 1)
  on conflict (user_id, jour) do update set nb = public.ia_usage.nb + 1
    where public.ia_usage.nb < limite
  returning nb into n;
  return n is not null;
end;
$fn$;
revoke all on function public.ia_consommer(uuid, int) from public, anon, authenticated;
grant execute on function public.ia_consommer(uuid, int) to service_role;

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

alter table public.objets add column if not exists brouillon boolean not null default false;

drop policy if exists "objets lecture" on public.objets;
create policy "objets lecture" on public.objets for select
  using (not brouillon or auth.uid() = vendeur_id);
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
-- Personnalisation de la boutique : couleur, bannière, annonce, slogan et liens.
-- À lancer une fois dans Supabase (SQL Editor). Sans danger si relancé.

alter table public.vendeurs add column if not exists couleur text;
alter table public.vendeurs add column if not exists banniere_url text;
alter table public.vendeurs add column if not exists annonce text;
alter table public.vendeurs add column if not exists annonce_fin date;
alter table public.vendeurs add column if not exists slogan text;
alter table public.vendeurs add column if not exists lien_instagram text;
alter table public.vendeurs add column if not exists lien_facebook text;
alter table public.vendeurs add column if not exists lien_vinted text;

alter table public.vendeurs drop constraint if exists vendeurs_perso_ck;
alter table public.vendeurs add constraint vendeurs_perso_ck check (
  (couleur is null or couleur in ('rose','peche','corail','menthe','sauge','lavande','sable'))
  and (banniere_url is null or banniere_url ~ '^https://')
  and (annonce is null or char_length(annonce) <= 140)
  and (slogan is null or char_length(slogan) <= 40)
  and (lien_instagram is null or (lien_instagram ~ '^https://' and char_length(lien_instagram) <= 200))
  and (lien_facebook is null or (lien_facebook ~ '^https://' and char_length(lien_facebook) <= 200))
  and (lien_vinted is null or (lien_vinted ~ '^https://' and char_length(lien_vinted) <= 200))
);

-- Les visiteurs sans compte peuvent lire ces champs (ils s'affichent sur la boutique).
grant select (couleur, banniere_url, annonce, annonce_fin, slogan, lien_instagram, lien_facebook, lien_vinted)
  on public.vendeurs to anon;
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

create or replace function public.admin_demandes()
returns table (user_id uuid, nom text, ville text, contact text, message text, statut text, created_at timestamptz, email text)
language sql stable security definer set search_path = public as $$
  select o.user_id, o.nom, o.ville, o.contact, o.message, o.statut, o.created_at, u.email::text
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
