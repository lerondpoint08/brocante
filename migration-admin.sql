-- Outils d'administration (onglet Admin de Mon espace). À lancer après migration-organisateurs.sql.
create or replace function public.admin_aide()
returns table (id uuid, type text, message text, contact text, page text, langue text, created_at timestamptz, boutique text)
language sql stable security definer set search_path = public as $$
  select d.id, d.type, d.message, d.contact, d.page, d.langue, d.created_at, v.nom
  from public.demandes_aide d left join public.vendeurs v on v.id = d.user_id
  where public.est_admin()
  order by d.created_at desc limit 200;
$$;
create or replace function public.admin_supprimer_aide(cible uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'réservé aux administrateurs'; end if;
  delete from public.demandes_aide where id = cible;
end $$;
create or replace function public.admin_chiffres()
returns table (comptes bigint, boutiques bigint, objets bigint, objets_vendus bigint, brocantes_a_venir bigint, orga_attente bigint, messages bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from auth.users), (select count(*) from public.vendeurs),
         (select count(*) from public.objets where etat <> 'Vendu'), (select count(*) from public.objets where etat = 'Vendu'),
         (select count(*) from public.brocantes where date >= current_date),
         (select count(*) from public.organisateurs where statut = 'attente'),
         (select count(*) from public.demandes_aide)
  where public.est_admin();
$$;
revoke execute on function public.admin_aide() from public, anon;
revoke execute on function public.admin_supprimer_aide(uuid) from public, anon;
revoke execute on function public.admin_chiffres() from public, anon;
grant execute on function public.admin_aide() to authenticated;
grant execute on function public.admin_supprimer_aide(uuid) to authenticated;
grant execute on function public.admin_chiffres() to authenticated;
