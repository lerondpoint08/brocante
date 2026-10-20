-- Contact réservé aux personnes connectées : le numéro WhatsApp n'est plus lisible sans compte.
-- À coller une seule fois dans Supabase : SQL Editor, puis Run. Sans danger si déjà fait.
-- Les visiteurs sans compte voient toujours les boutiques, objets et marchés, mais plus la colonne « whatsapp ».
-- Si vous ajoutez plus tard une colonne publique à la table vendeurs, ajoutez-la aussi dans la liste ci-dessous.

revoke select on public.vendeurs from anon;
grant select (id, slug, nom, lieu, presentation, logo_url) on public.vendeurs to anon;
grant select on public.vendeurs to authenticated;
