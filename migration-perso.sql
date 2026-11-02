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
