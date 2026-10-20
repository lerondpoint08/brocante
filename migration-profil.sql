-- Profil du brocanteur : message d'accueil, logo, et suppression de son propre compte.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.

alter table public.vendeurs
  add column if not exists lieu text check (lieu is null or char_length(lieu) <= 80),
  add column if not exists presentation text check (presentation is null or char_length(presentation) <= 600),
  add column if not exists logo_url text;

-- Permet à un brocanteur connecté de supprimer son propre compte (et, en cascade, sa boutique, ses objets et ses marchés).
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
