(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
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

  async function liste() {
    var r = await sb.from("vendeurs").select("slug,nom").order("nom");
    if (r.error) { erreur("Impossible de charger les boutiques pour le moment."); return; }
    var box = $("boutiques");
    (r.data || []).forEach(function (v) {
      var a = el("a", null, v.nom);
      a.href = "?v=" + encodeURIComponent(v.slug);
      box.appendChild(a);
    });
    $("aucune").hidden = (r.data || []).length > 0;
    montrer("vue-liste");
  }

  async function boutique() {
    var r = await sb.from("vendeurs").select("*").eq("slug", slug).maybeSingle();
    if (r.error || !r.data) { erreur("Cette boutique n'existe pas."); return; }
    vendeur = r.data;
    document.title = vendeur.nom + " – Les trouvailles du moment";
    $("titre").textContent = "Bienvenue chez " + vendeur.nom;
    $("logo").textContent = vendeur.nom;
    $("pied").textContent = "© " + new Date().getFullYear() + " " + vendeur.nom;
    $("nav").hidden = false;
    var res = await Promise.all([
      sb.from("objets").select("*").eq("vendeur_id", vendeur.id).order("created_at", { ascending: false }),
      sb.from("marches").select("*").eq("vendeur_id", vendeur.id).gte("date", today()).order("date")
    ]);
    objets = res[0].data || [];
    marches = res[1].data || [];
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

  function rendre() {
    var l = objets.filter(function (o) {
      var okCat = cat === "Tout" || (cat === PRES ? estPresent(o) : o.categorie === cat);
      var okQ = !terme || ((o.nom || "") + " " + (o.description || "") + " " + (o.categorie || "")).toLowerCase().indexOf(terme) >= 0;
      return okCat && okQ;
    });
    var grid = $("grid"); grid.textContent = "";
    l.forEach(function (o) {
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
      if (o.description) info.appendChild(el("p", "meta", o.description));
      var row = el("div", "row");
      row.appendChild(el("span", "price", Number(o.prix).toLocaleString("fr-FR") + " €"));
      if (o.etat !== "Vendu" && vendeur.whatsapp) {
        var ask = el("a", "btn btn-gold ask", "Ça m'intéresse");
        ask.href = "https://wa.me/" + vendeur.whatsapp + "?text=" + encodeURIComponent("Bonjour, je suis intéressé(e) par : " + o.nom + " (" + o.prix + " €).");
        ask.target = "_blank"; ask.rel = "noopener";
        row.appendChild(ask);
      }
      info.appendChild(row);
      a.appendChild(ph); a.appendChild(info); grid.appendChild(a);
    });
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

  $("q").addEventListener("input", function (e) { terme = e.target.value.trim().toLowerCase(); rendre(); });
  var up = $("up");
  window.addEventListener("scroll", function () { up.classList.toggle("show", window.scrollY > 400); }, { passive: true });
  up.addEventListener("click", function () { window.scrollTo({ top: 0 }); });

  (slug ? boutique() : liste()).catch(function () { erreur("Une erreur est survenue. Réessayez dans un instant."); });
})();
