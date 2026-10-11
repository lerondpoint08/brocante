# Mise en ligne du site de brocante

Compte environ une à deux heures la première fois. Les noms des menus peuvent légèrement changer : si un libellé diffère, cherchez le mot le plus proche.

## Contenu du dossier
- `index.html`, `app-public.js` : la page que voient les clients.
- `espace.html`, `app-espace.js` : l'espace du vendeur (connexion, objets, photos, marchés).
- `style.css` : l'apparence.
- `config.js` : à remplir avec les informations de votre projet.
- `supabase.sql` : à coller dans Supabase pour créer la base de données.

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
