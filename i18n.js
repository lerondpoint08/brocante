/* Traductions du site. Une langue = un dictionnaire { clé: texte }.
   Les textes du HTML portent data-i18n="clé" (ou data-i18n-attr="placeholder:clé,aria-label:clé").
   Une clé absente d'une langue retombe sur le français : rien ne s'affiche jamais vide.
   Une langue n'est proposée au public que si elle figure dans DISPONIBLES (traduction terminée et relue). */
(function () {
  var DICT = { fr: {}, en: {} };
  var DISPONIBLES = ["fr"];
  var NOMS = { fr: "Français", en: "English" };
  var defaut = "fr", lang = defaut;
  try { var s = localStorage.getItem("brocante_lang"); if (s && DISPONIBLES.indexOf(s) >= 0) lang = s; } catch (e) { /* ignoré */ }

  function t(cle, vars) {
    var txt = (DICT[lang] && DICT[lang][cle] !== undefined) ? DICT[lang][cle] : (DICT[defaut][cle] !== undefined ? DICT[defaut][cle] : cle);
    if (vars) Object.keys(vars).forEach(function (k) { txt = txt.split("{" + k + "}").join(vars[k]); });
    return txt;
  }
  function appliquer(racine) {
    racine = racine || document;
    Array.prototype.forEach.call(racine.querySelectorAll("[data-i18n]"), function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    Array.prototype.forEach.call(racine.querySelectorAll("[data-i18n-attr]"), function (n) {
      n.getAttribute("data-i18n-attr").split(",").forEach(function (paire) {
        var p = paire.split(":"); if (p.length === 2) n.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", "ltr");
  }
  function choisir(code) {
    if (DISPONIBLES.indexOf(code) < 0) return false;
    try { localStorage.setItem("brocante_lang", code); } catch (e) { /* ignoré */ }
    location.reload();
    return true;
  }
  /* Le dictionnaire français est la référence : ajouter les clés ici, puis les traduire dans les autres langues. */
  Object.assign(DICT.fr, {
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
    "hero.bienvenue": "Bienvenue",
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
    "edit.titre": "Modifier l'objet",
    "edit.photo": "Photo (laisser vide pour garder l'actuelle)",
    "edit.extras": "Photos supplémentaires (3 au maximum)",
    "edit.ajouter": "Ajouter des photos",
    "edit.nom": "Nom de l'objet",
    "edit.prix": "Prix en €",
    "edit.etat": "État",
    "edit.dispo": "Disponible",
    "edit.reserve": "Réservé",
    "edit.vendu": "Vendu",
    "edit.cat": "Catégorie",
    "edit.desc": "Description (facultatif)",
    "edit.enregistrer": "Enregistrer",
    "edit.annuler": "Annuler",
    "haut.aria": "Retourner en haut de la page",
    "pied.prix": "Les prix sont indiqués en euros.",
    "pied.vendeur": "Espace vendeur",
    "pied.deco": "Se déconnecter"
  });

  window.I18N = { t: t, appliquer: appliquer, choisir: choisir, lang: function () { return lang; }, disponibles: function () { return DISPONIBLES.slice(); }, noms: NOMS, dict: DICT };
  window.t = t;
  /* Le script est chargé en fin de page : le HTML est déjà là, on applique tout de suite, avant app-public.js. */
  appliquer();
})();
