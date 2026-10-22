-- Plafond de fiches « Remplir avec l'IA » par vendeur et par jour.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- La table n'est lisible par personne côté site : seule la fonction « fiche-objet » l'utilise.

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
