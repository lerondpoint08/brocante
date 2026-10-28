/* Traductions du site. Une langue = un dictionnaire { clé: texte }.
   Les textes du HTML portent data-i18n="clé" (ou data-i18n-attr="placeholder:clé,aria-label:clé").
   Une clé absente d'une langue retombe sur le français : rien ne s'affiche jamais vide.
   Une langue n'est proposée au public que si elle figure dans DISPONIBLES (traduction terminée et relue). */
(function () {
  var DICT = { fr: {}, en: {} };
  var DISPONIBLES = ["fr", "en"];
  var NOMS = { fr: "Français", en: "English" };
  var defaut = "fr", lang = defaut;
  try { var s = localStorage.getItem("brocante_lang"); if (s && DISPONIBLES.indexOf(s) >= 0) lang = s; } catch (e) { /* ignoré */ }

  function t(cle, vars) {
    var txt = (DICT[lang] && DICT[lang][cle] !== undefined) ? DICT[lang][cle] : (DICT[defaut][cle] !== undefined ? DICT[defaut][cle] : cle);
    if (vars) Object.keys(vars).forEach(function (k) { txt = txt.split("{" + k + "}").join(vars[k]); });
    return txt;
  }
  /* Pluriel : clé_1 (n = 1) ou clé_n. */
  function tn(base, n, vars) { var v = vars || {}; v.n = n; return t(base + (n === 1 ? "_1" : "_n"), v); }
  function locale() { return lang === "en" ? "en-GB" : "fr-FR"; }
  /* Libellés des valeurs stockées en français dans la base (catégories, états) : seul l'affichage est traduit. */
  function lib(prefixe, valeur) { var k = prefixe + "." + valeur; return (DICT[lang] && DICT[lang][k] !== undefined) ? DICT[lang][k] : valeur; }
  function appliquer(racine) {
    racine = racine || document;
    Array.prototype.forEach.call(racine.querySelectorAll("[data-i18n]"), function (n) {
      var txt = t(n.getAttribute("data-i18n"));
      if (!n.children.length) { n.textContent = txt; return; }
      /* Élément qui contient aussi un champ (label…) : on ne remplace que son premier texte. */
      for (var k = 0; k < n.childNodes.length; k++) { var c = n.childNodes[k]; if (c.nodeType === 3 && c.nodeValue.trim()) { c.nodeValue = txt; break; } }
    });
    Array.prototype.forEach.call(racine.querySelectorAll("[data-i18n-html]"), function (n) { n.innerHTML = t(n.getAttribute("data-i18n-html")); });
    Array.prototype.forEach.call(racine.querySelectorAll("[data-i18n-attr]"), function (n) {
      n.getAttribute("data-i18n-attr").split(",").forEach(function (paire) {
        var p = paire.split(":"); if (p.length === 2) n.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", "ltr");
  }
  /* La langue choisie est aussi gardée dans le compte (si la personne est connectée) : elle la retrouve sur ses autres appareils. */
  var avant = null;
  function choisir(code) {
    if (DISPONIBLES.indexOf(code) < 0) return false;
    var fait = false;
    function aller() { if (fait) return; fait = true; try { localStorage.setItem("brocante_lang", code); } catch (e) { /* ignoré */ } location.reload(); }
    setTimeout(aller, 1500);
    try { Promise.resolve(avant ? avant(code) : null).then(aller, aller); } catch (e) { aller(); }
    return true;
  }
  var deja = false;
  function synchroniser(sb, session) {
    if (!sb || !session || !session.user || deja) return;
    deja = true;
    var m = (session.user.user_metadata || {}).langue;
    if (m && DISPONIBLES.indexOf(m) >= 0) {
      if (m !== lang) { try { localStorage.setItem("brocante_lang", m); } catch (e) { return; } location.reload(); }
    } else if (!m) {
      try { sb.auth.updateUser({ data: { langue: lang } }).then(function () {}, function () {}); } catch (e) { /* ignoré */ }
    }
  }

  /* Le dictionnaire français est la référence : ajouter les clés ici, puis les traduire dans les autres langues. */
  Object.assign(DICT.fr, {
    "nav.flag": "🇫🇷",
    "tout": "Tout",
    "pres": "Présents aujourd'hui",
    "cat.Meubles": "Meubles",
    "cat.Vaisselle": "Vaisselle",
    "cat.Déco": "Déco",
    "cat.Luminaires": "Luminaires",
    "cat.Jouets": "Jouets",
    "cat.Livres": "Livres",
    "cat.Vêtements": "Vêtements",
    "cat.Bijoux": "Bijoux",
    "cat.Outils": "Outils",
    "cat.Électroménager": "Électroménager",
    "cat.Disques": "Disques",
    "cat.Divers": "Divers",
    "etat.Disponible": "Disponible",
    "etat.Réservé": "Réservé",
    "etat.Vendu": "Vendu",
    "depuis.0": "aujourd'hui",
    "depuis.1": "hier",
    "depuis.j": "il y a {n} jours",
    "depuis.m": "il y a {n} mois",
    "depuis.an": "il y a plus d'un an",
    "err.chargement": "Le site n'a pas pu se charger. Rechargez la page dans un instant.",
    "compte.mon": "Mon compte",
    "compte.espace": "Mon espace",
    "nouv.sem_1": "Nouveau : {n} objet ajouté cette semaine",
    "nouv.sem_n": "Nouveau : {n} objets ajoutés cette semaine",
    "suivie": "★ Boutique suivie",
    "rech.cours": "Recherche…",
    "rech.indispo": "La recherche est indisponible pour le moment.",
    "trouve_1": "{n} objet trouvé",
    "trouve_n": "{n} objets trouvés",
    "err.boutiques": "Impossible de charger les boutiques pour le moment.",
    "maj": "Dernière mise à jour : {d}",
    "nouv.titre_page": "Nouveautés du site – Brocantes",
    "nouv.aucune": "Aucune nouveauté à afficher pour le moment.",
    "nouv.recent": "Récent",
    "suivre.on": "✓ Vous suivez cette boutique",
    "suivre.porte.titre": "Un compte gratuit pour suivre une boutique",
    "suivre.porte.texte": "Créez un compte (une minute) ou connectez-vous pour suivre cette boutique et retrouver ses nouveautés en premier sur la liste.",
    "err.impossible": "Impossible pour le moment. Réessayez dans un instant.",
    "err.boutique": "Impossible de charger cette boutique pour le moment. Réessayez dans un instant.",
    "err.inconnue": "Cette boutique n'existe pas.",
    "titre.boutique": "{nom} – Les trouvailles du moment",
    "bienvenue": "Bienvenue chez {nom}",
    "base": "Basé à : {lieu}",
    "wa.question": "Bonjour, j'ai une question sur vos objets.",
    "partage.boutique": "Découvre la boutique « {nom} » : ses trouvailles de brocante.",
    "lien.copie": "Lien copié ✓",
    "auj.a": "Aujourd'hui, je suis à : {nom}.",
    "auj.stand": "Aujourd'hui, je suis sur mon stand.",
    "auj.ici_1": " {n} objet est sur mon stand.",
    "auj.ici_n": " {n} objets sont sur mon stand.",
    "modifier": "Modifier",
    "modifier.aria": "Modifier « {nom} »",
    "porte.aria": "Compte nécessaire",
    "porte.titre": "Un compte gratuit est nécessaire",
    "porte.texte": "Pour contacter un vendeur, créez un compte (une minute) ou connectez-vous. Cela protège les vendeurs des messages indésirables.",
    "porte.creer": "Créer un compte",
    "porte.deja": "J'ai déjà un compte",
    "fermer": "Fermer",
    "lg.trad": "Traduire la page avec mon téléphone",
    "lg.iphone": "touchez « aA » dans la barre d'adresse, puis « Traduire ».",
    "lg.android": "touchez les trois points, puis « Traduire ».",
    "lg.pc": "clic droit sur la page, puis « Traduire en… ».",
    "lg.pc.nom": "Ordinateur",
    "lg.auto": "Traduction automatique : elle peut se tromper sur certains mots.",
    "lg.autres": "D'autres langues arrivent. Dites-nous laquelle vous aiderait, on s'en occupe en priorité.",
    "lg.votre": "Votre langue",
    "lg.envoyer": "Envoyer",
    "lg.ecrire": "Écrivez le nom de votre langue.",
    "lg.echec": "Envoi impossible pour le moment. Réessayez plus tard.",
    "lg.merci": "Merci ! Votre demande est bien reçue.",
    "lg.choisir": "Choisir la langue",
    "zoom.copie": "Lien copié : collez-le dans un message.",
    "zoom.photo": "Photo {i} sur {n}",
    "interesse": "Ça m'intéresse",
    "wa.objet": "Bonjour, je suis intéressé(e) par : {nom} ({prix}).",
    "chez": ", chez {nom}",
    "carte.agrandir": "Cliquer pour agrandir",
    "carte.photo": "Photo à venir",
    "carte.ici": "Présent sur le stand",
    "carte.boutique": "Boutique : {nom}",
    "carte.ajoute": "Ajouté {quand}",
    "prix": "{n} €",
    "dist.calcul": "Calcul en cours…",
    "dist.introuvable": "Lieu introuvable sur la carte : touchez « Itinéraire ».",
    "dist.env": "À environ {d} km de vous (à vol d'oiseau).",
    "dist.refus": "Position refusée : autorisez la localisation, ou touchez « Itinéraire ».",
    "dist.indispo": "Distance indisponible pour le moment : touchez « Itinéraire ».",
    "dates.aucune": "Aucune date annoncée pour le moment. Revenez bientôt.",
    "dates.itineraire": "Itinéraire",
    "dates.distance": "Voir la distance",
    "count_1": "{n} objet",
    "count_n": "{n} objets",
    "err.generale": "Une erreur est survenue. Réessayez dans un instant.",
    "nav.brocanteurs": "Les brocanteurs",
    "nav.nouveautes": "Nouveautés",
    "nav.trouvailles": "Trouvailles",
    "nav.ou": "Où me trouver",
    "nav.contact": "Contact",
    "nav.compte.long": "Se connecter / S'inscrire",
    "nav.compte.court": "Connexion",
    "nav.langue": "Langue",
    "nav.langue.aria": "Langue du site",
    "nav.sections": "Sections",
    "nav.navigation": "Navigation",
    "liste.titre": "Les brocanteurs",
    "liste.lead": "Choisissez une boutique pour voir ses trouvailles.",
    "liste.recherche": "Rechercher un objet dans toutes les boutiques",
    "liste.boutiques": "Boutiques correspondantes",
    "liste.aucune": "Aucune boutique pour le moment.",
    "liste.aucun_resultat": "Aucun résultat. Essayez un autre mot.",
    "liste.brocanteur": "Vous êtes brocanteur ?",
    "liste.creer": "Créez votre boutique",
    "nouv.titre": "Nouveautés du site",
    "nouv.lead": "Les améliorations apportées au site, de la plus récente à la plus ancienne.",
    "nouv.toutes": "Voir toutes les boutiques",
    "hero.suivre": "Suivre cette boutique",
    "hero.partager": "Partager",
    "hero.texte": "Tout ne tient pas sur mon stand. Voici ce que j'ai en réserve : parcourez les trouvailles, choisissez, et je vous les apporte au prochain marché.",
    "hero.voir": "Voir les trouvailles",
    "tr.titre": "Les trouvailles du moment",
    "tr.lead": "Le stock change souvent. Un objet marqué « Vendu » n'est plus disponible.",
    "tr.recherche": "Rechercher un objet",
    "tr.categories": "Catégories",
    "tr.aucun": "Aucun objet ne correspond.",
    "ou.titre": "Où me trouver",
    "ou.lead": "Voici mes prochains marchés. Écrivez-moi avant pour que j'apporte votre objet.",
    "ct.titre": "Une question sur un objet ?",
    "ct.lead": "Je réponds en général dans la journée.",
    "ct.wa": "Écrire sur WhatsApp",
    "err.titre": "Oups",
    "haut.aria": "Retourner en haut de la page",
    "pied.prix": "Les prix sont indiqués en euros.",
    "pied.vendeur": "Espace vendeur",
    "pied.deco": "Se déconnecter"
  });
  /* English : traduction à faire relire par une personne qui parle anglais couramment. */
  Object.assign(DICT.en, {
    "nav.flag": "🇬🇧",
    "tout": "All",
    "pres": "Here today",
    "cat.Meubles": "Furniture",
    "cat.Vaisselle": "Tableware",
    "cat.Déco": "Decor",
    "cat.Luminaires": "Lighting",
    "cat.Jouets": "Toys",
    "cat.Livres": "Books",
    "cat.Vêtements": "Clothing",
    "cat.Bijoux": "Jewellery",
    "cat.Outils": "Tools",
    "cat.Électroménager": "Appliances",
    "cat.Disques": "Records",
    "cat.Divers": "Miscellaneous",
    "etat.Disponible": "Available",
    "etat.Réservé": "Reserved",
    "etat.Vendu": "Sold",
    "depuis.0": "today",
    "depuis.1": "yesterday",
    "depuis.j": "{n} days ago",
    "depuis.m": "{n} months ago",
    "depuis.an": "over a year ago",
    "err.chargement": "The site could not load. Please reload the page in a moment.",
    "compte.mon": "My account",
    "compte.espace": "My space",
    "nouv.sem_1": "New: {n} item added this week",
    "nouv.sem_n": "New: {n} items added this week",
    "suivie": "★ Following",
    "rech.cours": "Searching…",
    "rech.indispo": "Search is unavailable at the moment.",
    "trouve_1": "{n} item found",
    "trouve_n": "{n} items found",
    "err.boutiques": "Unable to load the shops at the moment.",
    "maj": "Last updated: {d}",
    "nouv.titre_page": "Site news – Brocantes",
    "nouv.aucune": "No news to show at the moment.",
    "nouv.recent": "Recent",
    "suivre.on": "✓ You follow this shop",
    "suivre.porte.titre": "A free account to follow a shop",
    "suivre.porte.texte": "Create an account (it takes a minute) or sign in to follow this shop and see its news first in the list.",
    "err.impossible": "Not possible right now. Please try again in a moment.",
    "err.boutique": "Unable to load this shop at the moment. Please try again in a moment.",
    "err.inconnue": "This shop does not exist.",
    "titre.boutique": "{nom} – Finds of the moment",
    "bienvenue": "Welcome to {nom}",
    "base": "Based in: {lieu}",
    "wa.question": "Hello, I have a question about your items.",
    "partage.boutique": "Discover the shop “{nom}”: its flea-market finds.",
    "lien.copie": "Link copied ✓",
    "auj.a": "Today I'm at: {nom}.",
    "auj.stand": "Today I'm at my stand.",
    "auj.ici_1": " {n} item is at my stand.",
    "auj.ici_n": " {n} items are at my stand.",
    "modifier": "Edit",
    "modifier.aria": "Edit “{nom}”",
    "porte.aria": "Account required",
    "porte.titre": "A free account is required",
    "porte.texte": "To contact a seller, create an account (it takes a minute) or sign in. This protects sellers from unwanted messages.",
    "porte.creer": "Create an account",
    "porte.deja": "I already have an account",
    "fermer": "Close",
    "lg.trad": "Translate the page with my phone",
    "lg.iphone": "tap “aA” in the address bar, then “Translate”.",
    "lg.android": "tap the three dots, then “Translate”.",
    "lg.pc": "right-click the page, then “Translate to…”.",
    "lg.pc.nom": "Computer",
    "lg.auto": "Automatic translation: it may get some words wrong.",
    "lg.autres": "More languages are coming. Tell us which one would help you and we'll prioritise it.",
    "lg.votre": "Your language",
    "lg.envoyer": "Send",
    "lg.ecrire": "Write the name of your language.",
    "lg.echec": "Unable to send right now. Please try again later.",
    "lg.merci": "Thank you! Your request has been received.",
    "lg.choisir": "Choose a language",
    "zoom.copie": "Link copied: paste it in a message.",
    "zoom.photo": "Photo {i} of {n}",
    "interesse": "I'm interested",
    "wa.objet": "Hello, I'm interested in: {nom} ({prix}).",
    "chez": ", at {nom}",
    "carte.agrandir": "Click to enlarge",
    "carte.photo": "Photo coming soon",
    "carte.ici": "At the stand",
    "carte.boutique": "Shop: {nom}",
    "carte.ajoute": "Added {quand}",
    "prix": "€{n}",
    "dist.calcul": "Calculating…",
    "dist.introuvable": "Place not found on the map: tap “Directions”.",
    "dist.env": "About {d} km from you (as the crow flies).",
    "dist.refus": "Location denied: allow location access, or tap “Directions”.",
    "dist.indispo": "Distance unavailable right now: tap “Directions”.",
    "dates.aucune": "No dates announced yet. Come back soon.",
    "dates.itineraire": "Directions",
    "dates.distance": "Show distance",
    "count_1": "{n} item",
    "count_n": "{n} items",
    "err.generale": "Something went wrong. Please try again in a moment.",
    "nav.brocanteurs": "The sellers",
    "nav.nouveautes": "News",
    "nav.trouvailles": "Finds",
    "nav.ou": "Where to find me",
    "nav.contact": "Contact",
    "nav.compte.long": "Sign in / Sign up",
    "nav.compte.court": "Sign in",
    "nav.langue": "Language",
    "nav.langue.aria": "Site language",
    "nav.sections": "Sections",
    "nav.navigation": "Navigation",
    "liste.titre": "The sellers",
    "liste.lead": "Pick a shop to see its finds.",
    "liste.recherche": "Search for an item in all shops",
    "liste.boutiques": "Matching shops",
    "liste.aucune": "No shops yet.",
    "liste.aucun_resultat": "No results. Try another word.",
    "liste.brocanteur": "Are you a seller?",
    "liste.creer": "Create your shop",
    "nouv.titre": "Site news",
    "nouv.lead": "Improvements made to the site, from newest to oldest.",
    "nouv.toutes": "See all shops",
    "hero.suivre": "Follow this shop",
    "hero.partager": "Share",
    "hero.texte": "Not everything fits on my stand. Here is what I have in stock: browse the finds, pick, and I'll bring them to the next market.",
    "hero.voir": "See the finds",
    "tr.titre": "Finds of the moment",
    "tr.lead": "Stock changes often. An item marked “Sold” is no longer available.",
    "tr.recherche": "Search for an item",
    "tr.categories": "Categories",
    "tr.aucun": "No item matches.",
    "ou.titre": "Where to find me",
    "ou.lead": "Here are my next markets. Write to me beforehand so I can bring your item.",
    "ct.titre": "A question about an item?",
    "ct.lead": "I usually reply within the day.",
    "ct.wa": "Write on WhatsApp",
    "err.titre": "Oops",
    "haut.aria": "Back to top of the page",
    "pied.prix": "Prices are shown in euros.",
    "pied.vendeur": "Seller area",
    "pied.deco": "Sign out"
  });

  /* Ajoute des textes à une langue (utilisé par i18n-espace.js). */
  function ajouter(code, dict) { DICT[code] = Object.assign(DICT[code] || {}, dict); }
  window.I18N = { synchroniser: synchroniser, avantChangement: function (f) { avant = f; }, ajouter: ajouter, t: t, tn: tn, locale: locale, lib: lib,  appliquer: appliquer, choisir: choisir, lang: function () { return lang; }, disponibles: function () { return DISPONIBLES.slice(); }, noms: NOMS, dict: DICT };
  window.t = t;
  /* Le script est chargé en fin de page : le HTML est déjà là, on applique tout de suite, avant app-public.js. */
  appliquer();
})();
