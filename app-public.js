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
      pill.querySelector(".long").textContent = connecte ? "Mon espace" : "Se connecter / S'inscrire";
      pill.querySelector(".court").textContent = connecte ? "Mon espace" : "Connexion";
    }
    var d = $("deco"); if (d) d.hidden = !connecte;
  }
  sb.auth.getSession().then(function (r) {
    var ok = !!(r.data && r.data.session);
    LOG.debug("compte", ok ? "connecté" : "visiteur");
    userId = ok ? r.data.session.user.id : null;
    etatCompte(ok); crayons();
  }).catch(function (err) { LOG.error("compte", err); });
  sb.auth.onAuthStateChange(function (evt, session) { userId = session ? session.user.id : null; etatCompte(!!session); crayons(); });
  var deco = $("deco");
  if (deco) deco.addEventListener("click", async function (ev) {
    ev.preventDefault(); LOG.info("déconnexion", "demandée depuis le site");
    await sb.auth.signOut();
  });

  LOG.info("page", slug ? "boutique : " + slug : (pageNouv ? "nouveautés" : "liste des boutiques"));

  var boutiquesTous = [], tousObjets = null, chargement = null, aLieu = true;

  function afficherBoutiques(terme) {
    var box = $("boutiques"); box.textContent = "";
    var l = boutiquesTous.filter(function (v) { return !terme || ((v.nom || "") + " " + (v.lieu || "")).toLowerCase().indexOf(terme) >= 0; });
    l.forEach(function (v) {
      var a = el("a", "carte-boutique");
      a.href = "?v=" + encodeURIComponent(v.slug);
      if (v.logo_url && /^https:\/\//.test(v.logo_url)) {
        var lg = el("img", "logo-mini"); lg.src = v.logo_url; lg.alt = ""; lg.loading = "lazy"; a.appendChild(lg);
      }
      var tx = el("span", "txt-boutique", v.nom);
      if (v.lieu) tx.appendChild(el("small", "lieu", v.lieu));
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
    chargement = sb.from("objets").select("*, vendeurs(nom,slug,whatsapp" + (aLieu ? ",lieu" : "") + ")").order("created_at", { ascending: false }).limit(1000)
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
    var essais = ["slug,nom,lieu,logo_url", "slug,nom,lieu", "slug,nom"], r;
    for (var i = 0; i < essais.length; i++) {
      r = await sb.from("vendeurs").select(essais[i]).order("nom");
      if (!r.error || !(r.error.code === "42703" || r.error.code === "PGRST204")) break;
      LOG.warn("liste", "colonne absente : à ajouter dans Supabase (migration-lieu.sql ou migration-profil.sql)");
    }
    aLieu = essais[Math.min(i, essais.length - 1)].indexOf("lieu") >= 0 && !(r && r.error);
    if (r.error) { LOG.supa("liste.vendeurs", r.error); erreur("Impossible de charger les boutiques pour le moment."); return; }
    LOG.debug("liste", "boutiques : " + (r.data || []).length);
    $("tab-liste").setAttribute("aria-current", "page"); $("sub-liste").setAttribute("aria-current", "page");
    boutiquesTous = r.data || [];
    afficherBoutiques("");
    $("qg").addEventListener("input", function (e) { rechercheGlobale(e.target.value.trim().toLowerCase()); });
    montrer("vue-liste");
  }

  async function nouveautes() {
    $("tab-nouv").setAttribute("aria-current", "page"); $("sub-nouv").setAttribute("aria-current", "page");
    document.title = "Nouveautés – Brocantes";
    var t0 = Date.now();
    var champs = function (avecLieu) {
      return sb.from("objets").select("*, vendeurs(nom,slug,whatsapp" + (avecLieu ? ",lieu" : "") + ")")
        .neq("etat", "Vendu").order("created_at", { ascending: false }).limit(24);
    };
    var r = await champs(true);
    if (r.error && (r.error.code === "42703" || r.error.code === "PGRST204")) {
      LOG.warn("nouveautés", "colonne lieu absente : à ajouter dans Supabase (migration-lieu.sql)");
      r = await champs(false);
    }
    if (r.error) { LOG.supa("nouveautes.objets", r.error); erreur("Impossible de charger les nouveautés pour le moment."); return; }
    var l = r.data || [];
    LOG.debug("nouveautés", "objets : " + l.length + ", " + (Date.now() - t0) + " ms");
    var grid = $("gridn"); grid.textContent = "";
    l.forEach(function (o) { grid.appendChild(carte(o, o.vendeurs, true)); });
    $("cn").textContent = l.length + (l.length > 1 ? " objets" : " objet");
    $("emptyn").hidden = l.length > 0;
    montrer("vue-nouveautes");
  }

  async function boutique() {
    var t0 = Date.now();
    var r = await sb.from("vendeurs").select("*").eq("slug", slug).maybeSingle();
    if (r.error) { LOG.supa("boutique.vendeur", r.error); erreur("Impossible de charger cette boutique pour le moment. Réessayez dans un instant."); return; }
    if (!r.data) { LOG.warn("boutique", "adresse inconnue : " + slug); erreur("Cette boutique n'existe pas."); return; }
    vendeur = r.data;
    document.title = vendeur.nom + " – Les trouvailles du moment";
    $("titre").textContent = "Bienvenue chez " + vendeur.nom;
    $("lieu-boutique").textContent = vendeur.lieu ? "Basé à : " + vendeur.lieu : "";
    $("lieu-boutique").hidden = !vendeur.lieu;
    if (vendeur.presentation) $("hero-texte").textContent = vendeur.presentation;
    if (vendeur.logo_url && /^https:\/\//.test(vendeur.logo_url)) {
      var lg = $("logo-boutique"); lg.src = vendeur.logo_url; lg.alt = "Logo de " + vendeur.nom; lg.hidden = false;
    }
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
  function carte(o, v, avecBoutique) {
    var a = el("article", "item" + (o.etat === "Vendu" ? " sold" : ""));
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
      var lien = el("a", "shoplink", "Boutique : " + v.nom);
      lien.href = "?v=" + encodeURIComponent(v.slug);
      info.appendChild(lien);
      if (v.lieu) info.appendChild(el("span", "meta", v.lieu));
      var quand = depuis(o.created_at);
      if (quand) info.appendChild(el("span", "meta quand", "Ajouté " + quand));
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

  (slug ? boutique() : (pageNouv ? nouveautes() : liste())).catch(function (e) { LOG.error("public", e); erreur("Une erreur est survenue. Réessayez dans un instant."); });
})();
