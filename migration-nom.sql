-- Garde-fous sur le nom de la boutique : modifiable, mais avec des limites pour éviter les abus.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
--  - un changement de nom au plus une fois tous les 7 jours ;
--  - pas d'adresse internet ni d'e-mail dans le nom ;
--  - au moins une lettre ou un chiffre ;
--  - pas de nom qui se fait passer pour l'administration du site (admin, support, officiel, modérateur) ;
--  - deux boutiques ne peuvent pas porter le même nom (majuscules et espaces ignorés).

alter table public.vendeurs
  add column if not exists nom_modifie_le timestamptz;

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
