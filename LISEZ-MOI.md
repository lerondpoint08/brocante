# Mise en ligne du site de brocante

Compte environ une à deux heures la première fois. Les noms des menus peuvent légèrement changer : si un libellé diffère, cherchez le mot le plus proche.

## Contenu du dossier
- `index.html`, `app-public.js` : la page que voient les clients.
- `espace.html`, `app-espace.js` : l'espace du vendeur (connexion, objets, photos, marchés).
- `style.css` : l'apparence.
- `log.js` : le journal de bord, utile pour la maintenance (voir la section « Maintenance »).
- `config.js` : à remplir avec les informations de votre projet.
- `supabase.sql` : à coller dans Supabase pour créer la base de données.
- `migration-lieu.sql`, `migration-profil.sql`, `migration-nom.sql`, `migration-visiteurs.sql`, `migration-suivis.sql`, `migration-ia.sql` et `migration-galerie.sql`, `migration-rafale.sql` et `migration-langues.sql` : mises à jour de la base à coller une fois dans Supabase (lieu du brocanteur ; message d'accueil, photo de profil et suppression du compte ; garde-fous sur le nom de la boutique ; contact réservé aux personnes connectées ; suivre des boutiques ; plafond du bouton « Remplir avec l'IA » ; plusieurs photos par objet ; brouillons de la saisie rapide ; demandes de langue des visiteurs). Inutiles pour une installation neuve, car `supabase.sql` les contient déjà.

## Étape 1 : la base de données (Supabase)
1. Créez un compte gratuit sur supabase.com.
2. Créez un nouveau projet : donnez un nom, choisissez un mot de passe pour la base (notez-le) et une région en Europe.
3. Attendez quelques minutes que le projet soit prêt.
4. Dans le menu, ouvrez **SQL Editor**, collez tout le contenu de `supabase.sql`, puis cliquez sur **Run**. Le message doit indiquer un succès.
5. Allez dans **Project Settings**, puis **API** (ou « API Keys »). Copiez :
   - l'adresse du projet (**Project URL**),
   - la clé publique (**anon** ou **publishable**).
   Ne copiez jamais la clé « service_role » ou « secret ».
6. Ouvrez `config.js` et remplacez les deux valeurs.

Facultatif, pour simplifier : dans **Authentication**, vous pouvez désactiver la confirmation d'e-mail à l'inscription. Sinon, chaque nouveau vendeur doit cliquer sur un lien reçu par courriel.

## Étape 2 : la mise en ligne (GitHub Pages)
1. Créez un compte gratuit sur github.com.
2. Créez un **nouveau dépôt** (New repository), nommez-le par exemple `brocante`, choisissez **Public**.
3. Cliquez sur **uploading an existing file**, glissez tous les fichiers du dossier (y compris `config.js` rempli), puis **Commit changes**.
4. Dans le dépôt, ouvrez **Settings**, puis **Pages**. Sous « Source », choisissez la branche `main` et le dossier `/ (root)`, puis enregistrez.
5. Après quelques minutes, GitHub affiche l'adresse du site, de la forme `https://VOTRE-NOM.github.io/brocante/`.

## Étape 3 : relier les deux
Dans Supabase, ouvrez **Authentication**, puis **URL Configuration**, et indiquez l'adresse GitHub Pages comme **Site URL**. Cela sert aux liens des e-mails de confirmation.

## Étape 4 : premier essai
1. Ouvrez `https://VOTRE-NOM.github.io/brocante/espace.html` sur le téléphone.
2. Touchez **Créer un compte**, puis connectez-vous.
3. Créez la boutique, ajoutez un objet avec une photo et un marché.
4. Ouvrez le lien de la boutique pour vérifier ce que voient les clients.

## À savoir
- Chaque vendeur ne peut modifier que ses propres données : c'est géré par les règles du fichier `supabase.sql`.
- Les photos sont réduites automatiquement avant l'envoi.
- « Présent aujourd'hui » s'affiche aux clients uniquement le jour même.
- Pour d'autres vendeurs, il suffit qu'ils créent leur compte : chacun a sa boutique et son lien.
- Vous stockez des adresses e-mail : prévoyez une courte mention sur les données personnelles si vous ouvrez le site à d'autres.
- Vérifiez les limites des offres gratuites de Supabase et GitHub avant d'accueillir beaucoup de vendeurs.

## Maintenance : le journal de bord
Le site garde une trace de ses erreurs, pour comprendre ce qui ne va pas.

- **Sur PC** : ouvrez le site, appuyez sur F12, onglet **Console**. Les erreurs et avertissements y apparaissent, précédés de `[brocante]`.
- **Sur téléphone, ou pour récupérer le journal** : ajoutez `?debug=1` à l'adresse (par exemple `.../espace.html?debug=1`). Un bouton **Copier le journal** apparaît en bas à gauche. Collez ensuite le texte dans un message. Pour arrêter : `?debug=0`.
- **Ce qui est enregistré** : les erreurs de la base, de la connexion et des photos, les erreurs JavaScript, les ressources qui ne se chargent pas, et en mode détaillé les étapes (connexion, ajout d'un objet, taille des photos).
- **Ce qui ne l'est jamais** : adresses e-mail, mots de passe et jetons de connexion sont masqués.
- **Où il reste** : seulement dans le navigateur de la personne, jusqu'à la fermeture de l'onglet. Rien n'est envoyé à un serveur.
- **Côté Supabase** : le menu **Logs** montre les requêtes et les connexions. Sur l'offre gratuite, ils ne sont conservés qu'un jour environ : le journal du navigateur sert donc à garder la trace d'un problème.

## Traductions (en préparation)

`i18n.js` contient le dictionnaire français (la référence) et le mécanisme : les textes du HTML portent `data-i18n="clé"`. Une langue n'est proposée aux visiteurs que si elle est listée dans `DISPONIBLES` (traduction terminée et relue). Une clé absente retombe sur le français.
