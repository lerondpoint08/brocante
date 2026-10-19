(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LOG = window.LOG || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {}, supa: function () {} };
  var sb = null;
  try { sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); }
  catch (e) { LOG.error("init", e); }
  var slug = (new URLSearchParams(location.search).get("v") || "").toLowerCase().trim();
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
  function estPresent(o) { return o.present_date === today() && o.etat !== "Vendu"; }
  function montrer(id) {
    ["vue-liste", "vue-boutique", "vue-erreur"].forEach(function (v) { $(v).hidden = v !== id; });
  }
  function erreur(msg) { $("erreur").textContent = msg; montrer("vue-erreur"); }

  if (!sb || !window.CONFIG || /VOTRE-/.test(CONFIG.SUPABASE_URL)) {
    LOG.error("init", "Supabase indisponible ou config.js non rempli");
    erreur("Le site n'a pas pu se charger. Rechargez la page dans un instant.");
    return;
  }
  LOG.info("page", slug ? "boutique : " + slug : "liste des boutiques");

  var boutiquesTous = [], tousObjets = null, chargement = null;

  function afficherBoutiques(terme) {
    var box = $("boutiques"); box.textContent = "";
    var l = boutiquesTous.filter(function (v) { return !terme || (v.nom || "").toLowerCase().indexOf(terme) >= 0; });
    l.forEach(function (v) {
      var a = el("a", null, v.nom);
      a.href = "?v=" + encodeURIComponent(v.slug);
      box.appendChild(a);
    });
    $("aucune").hidden = boutiquesTous.length > 0;
    $("bt-titre").hidden = !terme || !l.length;
    return l.length;
  }

  function chargerObjets() {
    if (tousObjets) return Promise.resolve(tousObjets);
    if (chargement) return chargement;
    chargement = sb.from("objets").select("*, vendeurs(nom,slug,whatsapp)").order("created_at", { ascending: false }).limit(1000)
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
      return ((o.nom || "") + " " + (o.description || "") + " " + (o.categorie || "")).toLowerCase().indexOf(terme) >= 0;
    });
    var grid = $("gridg"); grid.textContent = "";
    l.forEach(function (o) { grid.appendChild(carte(o, o.vendeurs, true)); });
    $("cg").textContent = l.length + (l.length > 1 ? " objets trouvés" : " objet trouvé");
    $("emptyg").hidden = l.length > 0 || nbB > 0;
    LOG.debug("recherche", "« " + terme.length + " lettres » : " + l.length + " objets, " + nbB + " boutiques");
  }

  async function liste() {
    var r = await sb.from("vendeurs").select("slug,nom").order("nom");
    if (r.error) { LOG.supa("liste.vendeurs", r.error); erreur("Impossible de charger les boutiques pour le moment."); return; }
    LOG.debug("liste", "boutiques : " + (r.data || []).length);
    boutiquesTous = r.data || [];
    afficherBoutiques("");
    $("qg").addEventListener("input", function (e) { rechercheGlobale(e.target.value.trim().toLowerCase()); });
    montrer("vue-liste");
  }

  async function boutique() {
    var t0 = Date.now();
    var r = await sb.from("vendeurs").select("*").eq("slug", slug).maybeSingle();
    if (r.error) { LOG.supa("boutique.vendeur", r.error); erreur("Impossible de charger cette boutique pour le moment. Réessayez dans un instant."); return; }
    if (!r.data) { LOG.warn("boutique", "adresse inconnue : " + slug); erreur("Cette boutique n'existe pas."); return; }
    vendeur = r.data;
    document.title = vendeur.nom + " – Les trouvailles du moment";
    $("titre").textContent = "Bienvenue chez " + vendeur.nom;
    $("logo").textContent = vendeur.nom;
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
    if (vendeur.whatsapp) {
      var w = $("wa");
      w.href = "https://wa.me/" + vendeur.whatsapp + "?text=" + encodeURIComponent("Bonjour, j'ai une question sur vos objets.");
      w.hidden = false;
    }
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

  function carte(o, v, avecBoutique) {
    var a = el("article", "item" + (o.etat === "Vendu" ? " sold" : ""));
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
      var lien = el("a", "shoplink", "Boutique : " + v.nom);
      lien.href = "?v=" + encodeURIComponent(v.slug);
      info.appendChild(lien);
    }
    if (o.description) info.appendChild(el("p", "meta", o.description));
    var row = el("div", "row");
    row.appendChild(el("span", "price", Number(o.prix).toLocaleString("fr-FR") + " €"));
    if (o.etat !== "Vendu" && v && v.whatsapp) {
      var ask = el("a", "btn btn-gold ask", "Ça m'intéresse");
      ask.href = "https://wa.me/" + v.whatsapp + "?text=" + encodeURIComponent("Bonjour, je suis intéressé(e) par : " + o.nom + " (" + o.prix + " €).");
      ask.target = "_blank"; ask.rel = "noopener";
      row.appendChild(ask);
    }
    info.appendChild(row);
    a.appendChild(ph); a.appendChild(info);
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

  function dates() {
    var d = $("dates"); d.textContent = "";
    if (!marches.length) { d.appendChild(el("p", "empty", "Aucune date annoncée pour le moment. Revenez bientôt.")); return; }
    marches.forEach(function (m) {
      var c = el("div");
      c.appendChild(el("b", null, m.nom));
      c.appendChild(el("span", null, [dateFr(m.date), m.heures].filter(Boolean).join(", ")));
      if (m.lieu) c.appendChild(el("span", null, m.lieu));
      d.appendChild(c);
    });
  }

  if ($("q")) $("q").addEventListener("input", function (e) { terme = e.target.value.trim().toLowerCase(); rendre(); });
  var up = $("up");
  window.addEventListener("scroll", function () { up.classList.toggle("show", window.scrollY > 400); }, { passive: true });
  up.addEventListener("click", function () { window.scrollTo({ top: 0 }); });

  (slug ? boutique() : liste()).catch(function (e) { LOG.error("public", e); erreur("Une erreur est survenue. Réessayez dans un instant."); });
})();
