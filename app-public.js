(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LOG = window.LOG || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {}, supa: function () {} };
  var sb = null;
  try { sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); }
  catch (e) { LOG.error("init", e); }
  var params = new URLSearchParams(location.search);
  var slug = (params.get("v") || "").toLowerCase().trim();
  var pageNouv = !slug && params.get("page") === "nouveautes";
  var PRES = "Présents aujourd'hui";
  var vendeur = null, objets = [], marches = [], cat = "Tout", terme = "";

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dateFr(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    var t = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function depuis(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var j = Math.floor((Date.now() - t) / 86400000);
    if (j <= 0) return "aujourd'hui";
    if (j === 1) return "hier";
    if (j < 30) return "il y a " + j + " jours";
    var m = Math.floor(j / 30);
    return m < 12 ? "il y a " + m + " mois" : "il y a plus d'un an";
  }
  function estPresent(o) { return o.present_date === today() && o.etat !== "Vendu"; }
  function montrer(id) {
    ["vue-liste", "vue-nouveautes", "vue-boutique", "vue-erreur"].forEach(function (v) { $(v).hidden = v !== id; });
  }
  function erreur(msg) { $("erreur").textContent = msg; montrer("vue-erreur"); }

  if (!sb || !window.CONFIG || /VOTRE-/.test(CONFIG.SUPABASE_URL)) {
    LOG.error("init", "Supabase indisponible ou config.js non rempli");
    erreur("Le site n'a pas pu se charger. Rechargez la page dans un instant.");
    return;
  }
  /* En-tête selon la connexion : « Mon espace » si le vendeur est connecté, « Se connecter » sinon.
     La session est partagée avec la page espace.html : naviguer ici ne déconnecte jamais. */
  function etatCompte(connecte) {
    var pill = $("pill-compte");
    if (pill) {
      pill.querySelector(".long").textContent = connecte ? (simpleVisiteur ? "Mon compte" : "Mon espace") : "Se connecter / S'inscrire";
      pill.querySelector(".court").textContent = connecte ? (simpleVisiteur ? "Mon compte" : "Mon espace") : "Connexion";
    }
    var d = $("deco"); if (d) d.hidden = !connecte;
  }
  var simpleVisiteur = false;
  function estVisiteur(s) { return !!(s && s.user && s.user.user_metadata && s.user.user_metadata.role === "visiteur"); }
  var prete = sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session, ok = !!s;
    LOG.debug("compte", ok ? "connecté" : "visiteur");
    userId = ok ? s.user.id : null; simpleVisiteur = estVisiteur(s);
    etatCompte(ok); crayons();
  }).catch(function (err) { LOG.error("compte", err); });
  sb.auth.onAuthStateChange(function (evt, session) { userId = session ? session.user.id : null; simpleVisiteur = estVisiteur(session); etatCompte(!!session); crayons(); });
  var deco = $("deco");
  if (deco) deco.addEventListener("click", async function (ev) {
    ev.preventDefault(); LOG.info("déconnexion", "demandée depuis le site");
    await sb.auth.signOut();
  });

  LOG.info("page", slug ? "boutique : " + slug : (pageNouv ? "nouveautés" : "liste des boutiques"));

  var JOURS_NOUVEAU = 7, nouveaux = {}, suivies = {}, suiviOk = true;
  /* Boutiques déjà visitées sur cet appareil : la pastille disparaît après la visite. */
  function lireVu() { try { return JSON.parse(localStorage.getItem("brocante_vu") || "{}") || {}; } catch (e) { return {}; } }
  function marquerVu(id) { try { var m = lireVu(); m[id] = new Date().toISOString(); localStorage.setItem("brocante_vu", JSON.stringify(m)); } catch (e) {} }
  var boutiquesTous = [], tousObjets = null, chargement = null, aLieu = true, aLogo = true;

  function afficherBoutiques(terme) {
    var box = $("boutiques"); box.textContent = "";
    var l = boutiquesTous.filter(function (v) { return !terme || ((v.nom || "") + " " + (v.lieu || "")).toLowerCase().indexOf(terme) >= 0; });
    l.forEach(function (v) {
      var a = el("a", "carte-boutique");
      a.href = "?v=" + encodeURIComponent(v.slug);
      var n = nouveaux[v.id] || 0;
      var av = el("span", "av-wrap");
      av.appendChild(avatar(v.nom, v.logo_url, "av-m"));
      if (n) { var pa = el("span", "pastille", n > 9 ? "9+" : String(n)); pa.setAttribute("aria-hidden", "true"); av.appendChild(pa); }
      a.appendChild(av);
      var tx = el("span", "txt-boutique", v.nom);
      if (v.lieu) tx.appendChild(el("small", "lieu", v.lieu));
      if (n) tx.appendChild(el("small", "nouv", "Nouveau : " + n + (n > 1 ? " objets ajoutés" : " objet ajouté") + " cette semaine"));
      if (suivies[v.id]) tx.appendChild(el("small", "suivie", "\u2605 Boutique suivie"));
      a.appendChild(tx);
      box.appendChild(a);
    });
    $("aucune").hidden = boutiquesTous.length > 0;
    $("bt-titre").hidden = !terme || !l.length;
    return l.length;
  }

  function chargerObjets() {
    if (tousObjets) return Promise.resolve(tousObjets);
    if (chargement) return chargement;
    chargement = prete.then(function () { return sb.from("objets").select("*, vendeurs(nom,slug" + (userId ? ",whatsapp" : "") + (aLieu ? ",lieu" : "") + (aLogo ? ",logo_url" : "") + ")").order("created_at", { ascending: false }).limit(1000); })
      .then(function (r) {
        if (r.error) { LOG.supa("recherche.objets", r.error); chargement = null; throw r.error; }
        tousObjets = r.data || [];
        LOG.debug("recherche", "objets chargés : " + tousObjets.length);
        return tousObjets;
      });
    return chargement;
  }

  var dernier = 0;
  async function rechercheGlobale(terme) {
    var n = ++dernier;
    var zone = $("res-globale");
    if (terme.length < 2) {
      zone.hidden = true; afficherBoutiques(""); $("bt-titre").hidden = true;
      $("bt-wrap").hidden = false;
      return;
    }
    var nbB = afficherBoutiques(terme);
    $("bt-wrap").hidden = !nbB;
    zone.hidden = false;
    $("cg").textContent = "Recherche…";
    var data;
    try { data = await chargerObjets(); }
    catch (e) { $("cg").textContent = "La recherche est indisponible pour le moment."; return; }
    if (n !== dernier) return;
    var l = data.filter(function (o) {
      return ((o.nom || "") + " " + (o.description || "") + " " + (o.categorie || "") + " " + ((o.vendeurs && o.vendeurs.lieu) || "")).toLowerCase().indexOf(terme) >= 0;
    });
    var grid = $("gridg"); grid.textContent = "";
    l.forEach(function (o) { grid.appendChild(carte(o, o.vendeurs, true)); });
    $("cg").textContent = l.length + (l.length > 1 ? " objets trouvés" : " objet trouvé");
    $("emptyg").hidden = l.length > 0 || nbB > 0;
    LOG.debug("recherche", "« " + terme.length + " lettres » : " + l.length + " objets, " + nbB + " boutiques");
  }

  async function liste() {
    await prete;
    /* Objets ajoutés récemment, pour signaler les boutiques qui ont du nouveau. Sans effet si la requête échoue. */
    var depuis = new Date(Date.now() - JOURS_NOUVEAU * 86400000).toISOString();
    var pNouv = sb.from("objets").select("vendeur_id,created_at").gte("created_at", depuis).neq("etat", "Vendu").limit(1000);
    var essais = ["id,slug,nom,lieu,logo_url", "id,slug,nom,lieu", "id,slug,nom"], r;
    for (var i = 0; i < essais.length; i++) {
      r = await sb.from("vendeurs").select(essais[i]).order("nom");
      if (!r.error || !(r.error.code === "42703" || r.error.code === "PGRST204")) break;
      LOG.warn("liste", "colonne absente : à ajouter dans Supabase (migration-lieu.sql ou migration-profil.sql)");
    }
    var retenu = essais[Math.min(i, essais.length - 1)];
    aLieu = retenu.indexOf("lieu") >= 0 && !(r && r.error);
    aLogo = retenu.indexOf("logo_url") >= 0 && !(r && r.error);
    if (r.error) { LOG.supa("liste.vendeurs", r.error); erreur("Impossible de charger les boutiques pour le moment."); return; }
    LOG.debug("liste", "boutiques : " + (r.data || []).length);
    $("tab-liste").setAttribute("aria-current", "page"); $("sub-liste").setAttribute("aria-current", "page");
    boutiquesTous = r.data || [];
    if (userId) {
      try {
        var rs = await sb.from("suivis").select("vendeur_id").eq("visiteur_id", userId);
        if (rs.error) LOG.supa("liste.suivis", rs.error);
        else {
          (rs.data || []).forEach(function (s) { suivies[s.vendeur_id] = true; });
          boutiquesTous = boutiquesTous.filter(function (v) { return suivies[v.id]; }).concat(boutiquesTous.filter(function (v) { return !suivies[v.id]; }));
        }
      } catch (e) { LOG.error("liste.suivis", e); }
    }
    try {
      var rn = await pNouv;
      if (rn.error) LOG.supa("liste.nouveaux", rn.error);
      else {
        var vu = lireVu();
        (rn.data || []).forEach(function (o) {
          if (userId && o.vendeur_id === userId) return; /* pas de pastille pour ses propres objets */
          if (vu[o.vendeur_id] && o.created_at <= vu[o.vendeur_id]) return;
          nouveaux[o.vendeur_id] = (nouveaux[o.vendeur_id] || 0) + 1;
        });
      }
      LOG.debug("liste", "boutiques avec du nouveau : " + Object.keys(nouveaux).length);
    } catch (e) { LOG.error("liste.nouveaux", e); }
    afficherBoutiques("");
    $("qg").addEventListener("input", function (e) { rechercheGlobale(e.target.value.trim().toLowerCase()); });
    montrer("vue-liste");
  }

  /* Page « Nouveautés » : l'historique des améliorations du site (voir nouveautes.js). */
  function dateLongue(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }
  function majSite() {
    var l = (window.NOUVEAUTES || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return l;
  }
  function pied() {
    var l = majSite(), p = $("maj-pied");
    if (p && l.length) p.textContent = "Dernière mise à jour : " + dateLongue(l[0].date);
  }
  function nouveautes() {
    $("tab-nouv").setAttribute("aria-current", "page"); $("sub-nouv").setAttribute("aria-current", "page");
    document.title = "Nouveautés du site – Brocantes";
    var l = majSite(), box = $("journal"); box.textContent = "";
    if (!l.length) { box.appendChild(el("p", "empty", "Aucune nouveauté à afficher pour le moment.")); }
    else $("maj-haut").textContent = "Dernière mise à jour : " + dateLongue(l[0].date);
    l.forEach(function (e, i) {
      var c = el("article", "entree");
      var h = el("h3", null, dateLongue(e.date));
      if (i === 0) h.appendChild(el("span", "recent", "Récent"));
      c.appendChild(h);
      var ul = el("ul");
      (e.points || []).forEach(function (t) { ul.appendChild(el("li", null, t)); });
      c.appendChild(ul); box.appendChild(c);
    });
    LOG.debug("nouveautés", "entrées : " + l.length);
    montrer("vue-nouveautes");
    return Promise.resolve();
  }

  async function suivreBouton() {
    var b = $("suivre");
    if (!b || !vendeur || (userId && userId === vendeur.id)) return;
    var actif = false;
    function maj() { b.textContent = actif ? "\u2713 Vous suivez cette boutique" : "Suivre cette boutique"; b.setAttribute("aria-pressed", String(actif)); b.classList.toggle("on", actif); }
    if (userId) {
      var r = await sb.from("suivis").select("vendeur_id").eq("visiteur_id", userId).eq("vendeur_id", vendeur.id).maybeSingle();
      if (r.error) { LOG.supa("suivre.lecture", r.error); return; } /* table absente : le bouton reste caché */
      actif = !!r.data;
    }
    maj(); b.hidden = false;
    b.onclick = async function () {
      if (!userId) { ouvrirPorte(vendeur.slug, "Un compte gratuit pour suivre une boutique", "Créez un compte (une minute) ou connectez-vous pour suivre cette boutique et retrouver ses nouveautés en premier sur la liste."); return; }
      b.disabled = true;
      var q = actif
        ? await sb.from("suivis").delete().eq("visiteur_id", userId).eq("vendeur_id", vendeur.id)
        : await sb.from("suivis").insert({ visiteur_id: userId, vendeur_id: vendeur.id });
      b.disabled = false;
      if (q.error) { LOG.supa("suivre.maj", q.error); alert("Impossible pour le moment. Réessayez dans un instant."); return; }
      actif = !actif; maj(); LOG.info("suivre", actif ? "boutique suivie" : "suivi retiré");
    };
  }

  async function boutique() {
    var t0 = Date.now();
    await prete;
    /* Connecté : toutes les colonnes. Sans compte : seulement les colonnes publiques (jamais le numéro). */
    var essaisB = userId ? ["*"] : ["id,slug,nom,lieu,presentation,logo_url", "id,slug,nom,lieu,presentation", "id,slug,nom"], r;
    for (var ib = 0; ib < essaisB.length; ib++) {
      r = await sb.from("vendeurs").select(essaisB[ib]).eq("slug", slug).maybeSingle();
      if (!r.error) break;
    }
    if (r.error) { LOG.supa("boutique.vendeur", r.error); erreur("Impossible de charger cette boutique pour le moment. Réessayez dans un instant."); return; }
    if (!r.data) { LOG.warn("boutique", "adresse inconnue : " + slug); erreur("Cette boutique n'existe pas."); return; }
    vendeur = r.data;
    marquerVu(vendeur.id);
    document.title = vendeur.nom + " – Les trouvailles du moment";
    $("titre").textContent = "Bienvenue chez " + vendeur.nom;
    $("lieu-boutique").textContent = vendeur.lieu ? "Basé à : " + vendeur.lieu : "";
    $("lieu-boutique").hidden = !vendeur.lieu;
    if (vendeur.presentation) $("hero-texte").textContent = vendeur.presentation;
    var ha = $("hero-av"); ha.textContent = ""; ha.replaceWith(Object.assign(avatar(vendeur.nom, vendeur.logo_url, "av-l"), { id: "hero-av" }));
    $("logo-txt").textContent = vendeur.nom;
    var la = $("logo-av"); la.replaceWith(Object.assign(avatar(vendeur.nom, vendeur.logo_url, "av-s"), { id: "logo-av" }));
    $("pied").textContent = "© " + new Date().getFullYear() + " " + vendeur.nom;
    $("nav").hidden = false; $("subshop").hidden = false;
    var res = await Promise.all([
      sb.from("objets").select("*").eq("vendeur_id", vendeur.id).order("created_at", { ascending: false }),
      sb.from("marches").select("*").eq("vendeur_id", vendeur.id).gte("date", today()).order("date")
    ]);
    if (res[0].error) LOG.supa("boutique.objets", res[0].error);
    if (res[1].error) LOG.supa("boutique.marches", res[1].error);
    objets = res[0].data || [];
    marches = res[1].data || [];
    LOG.debug("boutique chargée", "objets : " + objets.length + ", marchés : " + marches.length + ", " + (Date.now() - t0) + " ms");
    var w = $("wa");
    w.hidden = !lienContact(w, vendeur.whatsapp, "Bonjour, j'ai une question sur vos objets.", vendeur.slug);
    suivreBouton();
    banniere(); puces(); rendre(); dates();
    montrer("vue-boutique");
  }

  function banniere() {
    var b = $("jour");
    var n = objets.filter(estPresent).length;
    var mj = marches.filter(function (m) { return m.date === today(); })[0];
    if (!n && !mj) { b.hidden = true; return; }
    b.textContent = "";
    b.appendChild(el("span", "dot"));
    var txt = "Aujourd'hui, je suis " + (mj ? "à : " + mj.nom : "sur mon stand") + ".";
    if (n) txt += " " + n + (n > 1 ? " objets sont" : " objet est") + " sur mon stand.";
    b.appendChild(document.createTextNode(txt));
    b.hidden = false;
  }

  function categories() {
    var s = ["Tout"];
    objets.forEach(function (o) { if (s.indexOf(o.categorie) < 0) s.push(o.categorie); });
    if (objets.some(estPresent)) s.splice(1, 0, PRES);
    return s;
  }
  function puces() {
    var box = $("chips"); box.textContent = "";
    categories().forEach(function (c) {
      var b = el("button", "chip", c);
      b.type = "button"; b.setAttribute("aria-pressed", c === cat);
      b.onclick = function () { cat = c; puces(); rendre(); };
      box.appendChild(b);
    });
  }

  function initiale(n) {
    var m = String(n || "").trim().match(/[A-Za-zÀ-ÿ0-9]/);
    return m ? m[0].toUpperCase() : "B";
  }
  function avatar(nom, url, taille) {
    var s = el("span", "avatar " + taille);
    s.setAttribute("aria-hidden", "true");
    if (url && /^https:\/\//.test(url)) {
      var im = el("img"); im.src = url; im.alt = ""; im.loading = "lazy";
      im.onerror = function () { im.remove(); s.textContent = initiale(nom); };
      s.appendChild(im);
    } else { s.textContent = initiale(nom); }
    return s;
  }
  var userId = null, reg = {};
  var SVG_CRAYON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/></svg>';
  function crayon(a) {
    var ph = a.querySelector(".photo");
    if (!ph || ph.querySelector(".crayon")) return;
    var b = el("button", "crayon"); b.type = "button";
    b.innerHTML = SVG_CRAYON;
    b.setAttribute("aria-label", "Modifier « " + ((reg[a.dataset.oid] || {}).o || {}).nom + " »");
    b.title = "Modifier";
    b.addEventListener("click", function () { ouvrirEdition(a.dataset.oid); });
    ph.appendChild(b);
  }
  function crayons() {
    document.querySelectorAll(".item[data-vid]").forEach(function (a) {
      var doit = !!userId && a.dataset.vid === userId, c = a.querySelector(".crayon");
      if (doit && !c) crayon(a); else if (!doit && c) c.remove();
    });
  }
  /* Contact : réservé aux personnes connectées. Les numéros ne sont même pas envoyés aux visiteurs sans compte. */
  var porteEl = null;
  function fermerPorte() { if (porteEl) { porteEl.remove(); porteEl = null; } }
  function ouvrirPorte(slugB, titre, texte) {
    fermerZoom(); fermerPorte();
    var retour = slugB ? "&retour=" + encodeURIComponent("?v=" + slugB) : "";
    var ov = el("div", "overlay zoom"); ov.addEventListener("click", function (e) { if (e.target === ov) fermerPorte(); });
    var box = el("div", "card modale porte"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Compte nécessaire");
    box.appendChild(el("h3", null, titre || "Un compte gratuit est nécessaire"));
    box.appendChild(el("p", "meta", texte || "Pour contacter un vendeur, créez un compte (une minute) ou connectez-vous. Cela protège les vendeurs des messages indésirables."));
    var a1 = el("a", "btn btn-gold", "Créer un compte"); a1.href = "espace.html?visiteur=1&mode=up" + retour;
    var a2 = el("a", "btn btn-line", "J'ai déjà un compte"); a2.href = "espace.html?visiteur=1&mode=in" + retour;
    var f = el("button", "btn btn-line small", "Fermer"); f.type = "button"; f.addEventListener("click", fermerPorte);
    box.appendChild(a1); box.appendChild(a2); box.appendChild(f);
    ov.appendChild(box); document.body.appendChild(ov); porteEl = ov; a1.focus();
  }
  /* Prépare un lien de contact. Renvoie false s'il ne faut pas l'afficher (connecté, mais le vendeur n'a pas de WhatsApp). */
  function lienContact(a, num, texte, slugB) {
    if (userId) {
      if (!num) return false;
      a.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(texte); a.target = "_blank"; a.rel = "noopener";
      return true;
    }
    a.href = "espace.html?visiteur=1&mode=up" + (slugB ? "&retour=" + encodeURIComponent("?v=" + slugB) : "");
    a.addEventListener("click", function (e) { e.preventDefault(); ouvrirPorte(slugB); });
    return true;
  }

  /* Zoom : un clic sur un objet l'affiche en grand. */
  var zoomEl = null, zoomRetour = null;
  function fermerZoom() { if (zoomEl) { zoomEl.remove(); zoomEl = null; document.body.style.overflow = ""; if (zoomRetour && zoomRetour.focus) zoomRetour.focus(); } }
  function ouvrirZoom(id) {
    var d = reg[id]; if (!d) return;
    var o = d.o, v = d.v;
    fermerZoom();
    zoomRetour = document.activeElement;
    var ov = el("div", "overlay zoom"); ov.addEventListener("click", function (e) { if (e.target === ov) fermerZoom(); });
    var box = el("div", "card modale zoom-box"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", o.nom);
    var x = el("button", "zoom-x", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", "Fermer"); x.addEventListener("click", fermerZoom);
    box.appendChild(x);
    if (o.photo_url && /^https:\/\//.test(o.photo_url)) { var img = el("img", "zoom-img"); img.src = o.photo_url; img.alt = o.nom; box.appendChild(img); }
    var t = el("div", "zoom-info");
    t.appendChild(el("h3", null, o.nom));
    t.appendChild(el("span", "meta", o.categorie + (o.etat !== "Disponible" ? " \u00b7 " + o.etat : "")));
    if (o.description) t.appendChild(el("p", "meta", o.description));
    t.appendChild(el("span", "price", Number(o.prix).toLocaleString("fr-FR") + " \u20ac"));
    if (o.etat !== "Vendu" && v) {
      var ask = el("a", "btn btn-gold ask", "\u00c7a m'int\u00e9resse");
      if (lienContact(ask, v.whatsapp, "Bonjour, je suis int\u00e9ress\u00e9(e) par : " + o.nom + " (" + o.prix + " \u20ac).", v.slug || (vendeur && vendeur.slug))) t.appendChild(ask);
    }
    box.appendChild(t); ov.appendChild(box); document.body.appendChild(ov);
    zoomEl = ov; document.body.style.overflow = "hidden"; x.focus();
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (porteEl) fermerPorte(); else if (zoomEl) fermerZoom(); } });
  document.addEventListener("click", function (e) {
    var it = e.target.closest && e.target.closest(".item");
    if (!it || e.target.closest("a, button") || it.closest(".zoom")) return;
    ouvrirZoom(it.dataset.oid);
  });

  function carte(o, v, avecBoutique) {
    var a = el("article", "item" + (o.etat === "Vendu" ? " sold" : "")); a.title = "Cliquer pour agrandir";
    a.dataset.oid = o.id; a.dataset.vid = o.vendeur_id || "";
    reg[o.id] = { o: o, v: v, avec: !!avecBoutique };
    var ph = el("div", "photo");
    if (o.photo_url && /^https:\/\//.test(o.photo_url)) {
      var img = el("img"); img.src = o.photo_url; img.alt = o.nom; img.loading = "lazy"; ph.appendChild(img);
    } else { ph.appendChild(el("div", "ph", "Photo à venir")); }
    if (o.etat !== "Disponible") ph.appendChild(el("span", "badge", o.etat));
    if (estPresent(o)) ph.appendChild(el("span", "ici", "Présent sur le stand"));
    var info = el("div", "info");
    info.appendChild(el("h3", null, o.nom));
    info.appendChild(el("span", "meta", o.categorie));
    if (avecBoutique && v) {
      var lien = el("a", "shoplink");
      lien.appendChild(avatar(v.nom, v.logo_url, "av-s"));
      lien.appendChild(el("span", null, "Boutique : " + v.nom));
      lien.href = "?v=" + encodeURIComponent(v.slug);
      info.appendChild(lien);
      if (v.lieu) info.appendChild(el("span", "meta", v.lieu));
      var quand = depuis(o.created_at);
      if (quand) info.appendChild(el("span", "meta quand", "Ajouté " + quand));
    }
    if (o.description) info.appendChild(el("p", "meta", o.description));
    var row = el("div", "row");
    row.appendChild(el("span", "price", Number(o.prix).toLocaleString("fr-FR") + " €"));
    if (o.etat !== "Vendu" && v) {
      var ask = el("a", "btn btn-gold ask", "Ça m'intéresse");
      if (lienContact(ask, v.whatsapp, "Bonjour, je suis intéressé(e) par : " + o.nom + " (" + o.prix + " €).", v.slug || (vendeur && vendeur.slug))) row.appendChild(ask);
    }
    info.appendChild(row);
    a.appendChild(ph); a.appendChild(info);
    if (userId && o.vendeur_id === userId) crayon(a);
    return a;
  }

  function rendre() {
    var l = objets.filter(function (o) {
      var okCat = cat === "Tout" || (cat === PRES ? estPresent(o) : o.categorie === cat);
      var okQ = !terme || ((o.nom || "") + " " + (o.description || "") + " " + (o.categorie || "")).toLowerCase().indexOf(terme) >= 0;
      return okCat && okQ;
    });
    var grid = $("grid"); grid.textContent = "";
    l.forEach(function (o) { grid.appendChild(carte(o, vendeur, false)); });
    $("count").textContent = l.length + (l.length > 1 ? " objets" : " objet");
    $("empty").hidden = l.length > 0;
  }

  /* ---------- Modifier un objet depuis sa photo (réservé à son propriétaire) ---------- */
  function reduire(file, max, q) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var r = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * r), h = Math.round(img.height * r);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("image")); }, "image/jpeg", q);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("image")); };
      img.src = url;
    });
  }
  var enEdition = null;
  function fermerEdition() {
    $("edit").hidden = true; enEdition = null;
    document.body.style.overflow = "";
    $("f-edit").reset(); $("e-prev").hidden = true; $("e-msg").textContent = "";
  }
  function ouvrirEdition(id) {
    var x = reg[id];
    if (!x || !userId || x.o.vendeur_id !== userId) return;
    enEdition = id;
    var o = x.o;
    $("e-nom").value = o.nom || ""; $("e-prix").value = o.prix; $("e-etat").value = o.etat || "Disponible";
    $("e-cat").value = o.categorie || ""; $("e-desc").value = o.description || "";
    var cats = {}; Object.keys(reg).forEach(function (k) { if (reg[k].o.categorie) cats[reg[k].o.categorie] = 1; });
    var dl = $("e-cats"); dl.textContent = "";
    Object.keys(cats).forEach(function (c) { var op = document.createElement("option"); op.value = c; dl.appendChild(op); });
    if (o.photo_url && /^https:\/\//.test(o.photo_url)) { $("e-prev").src = o.photo_url; $("e-prev").hidden = false; } else { $("e-prev").hidden = true; }
    $("e-msg").textContent = "";
    $("edit").hidden = false; document.body.style.overflow = "hidden";
    LOG.debug("édition", "ouverte");
    $("e-nom").focus();
  }
  $("e-non").addEventListener("click", fermerEdition);
  $("edit").addEventListener("click", function (ev) { if (ev.target === $("edit")) fermerEdition(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("edit").hidden) fermerEdition(); });
  $("e-photo").addEventListener("change", function () {
    var f = $("e-photo").files[0];
    if (f) { $("e-prev").src = URL.createObjectURL(f); $("e-prev").hidden = false; }
  });
  $("f-edit").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var x = reg[enEdition]; if (!x || !userId) return;
    var o = x.o, btn = $("e-go"); btn.disabled = true; $("e-msg").textContent = "Enregistrement…";
    try {
      var chg = {
        nom: $("e-nom").value.trim(), prix: parseFloat($("e-prix").value), etat: $("e-etat").value,
        categorie: $("e-cat").value.trim() || "Divers", description: $("e-desc").value.trim() || null
      };
      var ancienne = o.photo_url, f = $("e-photo").files[0];
      if (f) {
        var blob = await reduire(f, 1200, 0.82);
        LOG.debug("édition", "photo réduite : " + Math.round(blob.size / 1024) + " Ko");
        var chemin = userId + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
        var up = await sb.storage.from("photos").upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (up.error) throw up.error;
        chg.photo_url = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
      }
      var r = await sb.from("objets").update(chg).eq("id", o.id).select();
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error("aucune ligne modifiée");
      LOG.info("objet", "modifié" + (f ? " avec nouvelle photo" : ""));
      Object.assign(o, chg);
      if (f && ancienne) {
        var m = /\/photos\/(.+)$/.exec(ancienne);
        if (m) { var rm = await sb.storage.from("photos").remove([decodeURIComponent(m[1])]); if (rm.error) LOG.supa("photo.suppression", rm.error); }
      }
      if (vendeur && objets.indexOf(o) >= 0) { banniere(); puces(); rendre(); }
      else {
        var ancien = document.querySelector('.item[data-oid="' + o.id + '"]');
        if (ancien) ancien.replaceWith(carte(o, x.v, x.avec));
      }
      fermerEdition();
    } catch (err) {
      LOG.supa("objet.modification", err);
      $("e-msg").textContent = "Modification impossible. Vérifiez la photo et réessayez.";
      $("e-msg").className = "msg err";
    }
    btn.disabled = false;
  });

  /* Distance à vol d'oiseau entre la position de la personne et le lieu du marché.
     La position reste dans le navigateur ; seule l'adresse du marché est envoyée au service de cartes OpenStreetMap. */
  var geoCache = {};
  function km(a, b) {
    var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function maPosition() {
    return new Promise(function (ok, ko) {
      if (!navigator.geolocation) { ko({ code: 0 }); return; }
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lon: p.coords.longitude }); }, ko, { timeout: 15000, maximumAge: 300000 });
    });
  }
  async function lieuVersPoint(lieu) {
    if (geoCache[lieu]) return geoCache[lieu];
    var r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr,be,ch,lu&q=" + encodeURIComponent(lieu), { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("geocodage " + r.status);
    var j = await r.json();
    if (!j.length) return null;
    return (geoCache[lieu] = { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) });
  }
  async function distanceMarche(lieu, bouton, zone) {
    bouton.disabled = true; zone.textContent = "Calcul en cours…";
    try {
      var moi = await maPosition();
      var cible = await lieuVersPoint(lieu);
      if (!cible) { zone.textContent = "Lieu introuvable sur la carte : touchez « Itinéraire »."; bouton.disabled = false; return; }
      var d = km(moi, cible);
      zone.textContent = "À environ " + (d < 10 ? d.toFixed(1).replace(".", ",") : Math.round(d)) + " km de vous (à vol d'oiseau).";
      bouton.hidden = true;
    } catch (e) {
      LOG.warn("distance", e && (e.message || e.code));
      zone.textContent = e && e.code === 1 ? "Position refusée : autorisez la localisation, ou touchez « Itinéraire »." : "Distance indisponible pour le moment : touchez « Itinéraire ».";
      bouton.disabled = false;
    }
  }

  function dates() {
    var d = $("dates"); d.textContent = "";
    if (!marches.length) { d.appendChild(el("p", "empty", "Aucune date annoncée pour le moment. Revenez bientôt.")); return; }
    marches.forEach(function (m) {
      var c = el("div");
      c.appendChild(el("b", null, m.nom));
      c.appendChild(el("span", null, [dateFr(m.date), m.heures].filter(Boolean).join(", ")));
      if (m.lieu) {
        c.appendChild(el("span", null, m.lieu));
        var cible = [m.lieu, m.nom].join(", ");
        var bt = el("div", "mbtns");
        var it = el("a", "btn btn-gold small", "Itinéraire");
        var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        it.href = ios ? "https://maps.apple.com/?dirflg=d&daddr=" + encodeURIComponent(cible)
                      : "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(cible);
        it.target = "_blank"; it.rel = "noopener";
        var di = el("button", "btn btn-line small", "Voir la distance"); di.type = "button";
        var res = el("span", "dist"); res.setAttribute("role", "status");
        di.addEventListener("click", function () { distanceMarche(m.lieu, di, res); });
        bt.appendChild(it); bt.appendChild(di);
        c.appendChild(bt); c.appendChild(res);
      }
      d.appendChild(c);
    });
  }

  if ($("q")) $("q").addEventListener("input", function (e) { terme = e.target.value.trim().toLowerCase(); rendre(); });
  var up = $("up");
  window.addEventListener("scroll", function () { up.classList.toggle("show", window.scrollY > 400); }, { passive: true });
  up.addEventListener("click", function () { window.scrollTo({ top: 0 }); });

  pied();
  (slug ? boutique() : (pageNouv ? nouveautes() : liste())).catch(function (e) { LOG.error("public", e); erreur("Une erreur est survenue. Réessayez dans un instant."); });
})();
