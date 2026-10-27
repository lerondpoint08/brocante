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
