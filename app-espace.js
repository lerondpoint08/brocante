(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  var user = null, vendeur = null, mode = "in";

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dateFr(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function dire(id, texte, type) {
    var m = $(id); m.textContent = texte || ""; m.className = "msg" + (type ? " " + type : "");
  }
  function vue(id) {
    ["auth", "creer", "tableau"].forEach(function (v) { $(v).hidden = v !== id; });
    $("sortir").hidden = id === "auth";
  }
  function slugifier(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }
  function erreurLisible(e) {
    var m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet e-mail. Utilisez « Se connecter ».";
    if (/duplicate key|unique/i.test(m)) return "Cette adresse de boutique est déjà prise. Essayez-en une autre.";
    if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre e-mail (cliquez sur le lien reçu par courriel).";
    if (/Password should/i.test(m)) return "Mot de passe trop court (8 caractères minimum).";
    return "Une erreur est survenue. Réessayez dans un instant.";
  }

  /* ---------- Connexion ---------- */
  function choisirMode(m) {
    mode = m;
    $("t-in").setAttribute("aria-pressed", m === "in");
    $("t-up").setAttribute("aria-pressed", m === "up");
    $("a-go").textContent = m === "in" ? "Se connecter" : "Créer mon compte";
    $("a-mdp").autocomplete = m === "in" ? "current-password" : "new-password";
    dire("a-msg", "");
  }
  $("t-in").onclick = function () { choisirMode("in"); };
  $("t-up").onclick = function () { choisirMode("up"); };

  $("f-auth").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("a-go"); btn.disabled = true; dire("a-msg", "Un instant…");
    var email = $("a-mail").value.trim(), mdp = $("a-mdp").value;
    try {
      if (mode === "in") {
        var r = await sb.auth.signInWithPassword({ email: email, password: mdp });
        if (r.error) throw r.error;
      } else {
        var r2 = await sb.auth.signUp({ email: email, password: mdp, options: { emailRedirectTo: location.href.split("#")[0] } });
        if (r2.error) throw r2.error;
        if (!r2.data.session) { dire("a-msg", "Compte créé. Consultez votre boîte mail et cliquez sur le lien de confirmation, puis revenez vous connecter.", "ok"); }
      }
    } catch (err) { dire("a-msg", erreurLisible(err), "err"); }
    btn.disabled = false;
  });

  $("sortir").onclick = async function () { await sb.auth.signOut(); };

  /* ---------- Création de la boutique ---------- */
  $("c-nom").addEventListener("input", function () {
    if (!$("c-slug").dataset.touche) $("c-slug").value = slugifier($("c-nom").value);
  });
  $("c-slug").addEventListener("input", function () { $("c-slug").dataset.touche = "1"; });

  $("f-creer").addEventListener("submit", async function (e) {
    e.preventDefault();
    dire("c-msg", "Création…");
    var wa = $("c-wa").value.replace(/\D/g, "");
    var r = await sb.from("vendeurs").insert({ id: user.id, nom: $("c-nom").value.trim(), slug: $("c-slug").value.trim(), whatsapp: wa || null }).select().single();
    if (r.error) { dire("c-msg", erreurLisible(r.error), "err"); return; }
    vendeur = r.data; afficherTableau();
  });

  /* ---------- Tableau de bord ---------- */
  function lienPublic() {
    return location.origin + location.pathname.replace(/espace\.html$/, "") + "?v=" + vendeur.slug;
  }
  function afficherTableau() {
    vue("tableau");
    $("d-titre").textContent = vendeur.nom;
    var lien = lienPublic();
    $("d-lien").textContent = lien; $("d-voir").href = lien;
    $("w-num").value = vendeur.whatsapp || "";
    chargerObjets(); chargerMarches();
  }
  $("d-copier").onclick = async function () {
    try { await navigator.clipboard.writeText(lienPublic()); $("d-copier").textContent = "Lien copié"; }
    catch (e) { $("d-copier").textContent = "Copiez le lien ci-dessus"; }
    setTimeout(function () { $("d-copier").textContent = "Copier le lien"; }, 2500);
  };
  $("f-wa").addEventListener("submit", async function (e) {
    e.preventDefault();
    var wa = $("w-num").value.replace(/\D/g, "");
    var r = await sb.from("vendeurs").update({ whatsapp: wa || null }).eq("id", user.id);
    if (r.error) { dire("w-msg", "Numéro invalide (8 à 15 chiffres, sans + ni espaces).", "err"); return; }
    vendeur.whatsapp = wa || null; dire("w-msg", "Numéro enregistré.", "ok");
  });

  /* ---------- Photos ---------- */
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
  $("o-photo").addEventListener("change", function () {
    var f = $("o-photo").files[0], p = $("o-prev");
    if (!f) { p.hidden = true; return; }
    p.src = URL.createObjectURL(f); p.hidden = false;
  });

  /* ---------- Objets ---------- */
  var objets = [];
  async function chargerObjets() {
    var r = await sb.from("objets").select("*").eq("vendeur_id", user.id).order("created_at", { ascending: false });
    objets = r.data || [];
    var dl = $("cats"); dl.textContent = "";
    objets.map(function (o) { return o.categorie; }).filter(function (c, i, a) { return a.indexOf(c) === i; })
      .forEach(function (c) { var o = el("option"); o.value = c; dl.appendChild(o); });
    var box = $("l-obj"); box.textContent = "";
    if (!objets.length) { box.appendChild(el("p", "empty", "Aucun objet pour le moment. Ajoutez le premier ci-dessus.")); return; }
    objets.forEach(function (o) {
      var it = el("div", "it"); it.style.display = "block";
      var top = el("div"); top.style.display = "flex"; top.style.gap = "12px"; top.style.alignItems = "center";
      if (o.photo_url && /^https:\/\//.test(o.photo_url)) {
        var im = el("img"); im.src = o.photo_url; im.alt = ""; im.style.cssText = "width:64px;height:64px;object-fit:cover;border-radius:10px;flex:0 0 auto"; top.appendChild(im);
      }
      var t = el("div"); t.appendChild(el("b", null, o.nom)); t.appendChild(el("div", "meta", Number(o.prix).toLocaleString("fr-FR") + " € · " + o.categorie));
      top.appendChild(t); it.appendChild(top);

      var act = el("div", "rowact");
      var sel = el("select", "etat"); sel.setAttribute("aria-label", "État de " + o.nom);
      ["Disponible", "Réservé", "Vendu"].forEach(function (s) { var op = el("option", null, s); op.value = s; if (s === o.etat) op.selected = true; sel.appendChild(op); });
      sel.onchange = async function () {
        var r = await sb.from("objets").update({ etat: sel.value }).eq("id", o.id);
        if (r.error) alert("Modification impossible. Réessayez."); chargerObjets();
      };
      act.appendChild(sel);

      var pres = o.present_date === today();
      var tg = el("button", "btn btn-line small tog", pres ? "Présent aujourd'hui" : "Marquer présent aujourd'hui");
      tg.type = "button"; tg.setAttribute("aria-pressed", pres);
      tg.onclick = async function () {
        var r = await sb.from("objets").update({ present_date: pres ? null : today() }).eq("id", o.id);
        if (r.error) alert("Modification impossible. Réessayez."); chargerObjets();
      };
      act.appendChild(tg);

      var del = el("button", "btn btn-line small", "Supprimer"); del.type = "button";
      del.onclick = async function () {
        if (!confirm("Supprimer « " + o.nom + " » ?")) return;
        var r = await sb.from("objets").delete().eq("id", o.id);
        if (r.error) { alert("Suppression impossible. Réessayez."); return; }
        var m = /\/photos\/(.+)$/.exec(o.photo_url || "");
        if (m) await sb.storage.from("photos").remove([decodeURIComponent(m[1])]);
        chargerObjets();
      };
      act.appendChild(del);
      it.appendChild(act); box.appendChild(it);
    });
  }

  $("f-obj").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("o-go"); btn.disabled = true; dire("o-msg", "Envoi en cours…");
    try {
      var photo_url = null, f = $("o-photo").files[0];
      if (f) {
        var blob = await reduire(f, 1200, 0.82);
        var chemin = user.id + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
        var up = await sb.storage.from("photos").upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (up.error) throw up.error;
        photo_url = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
      }
      var r = await sb.from("objets").insert({
        vendeur_id: user.id, nom: $("o-nom").value.trim(), prix: parseFloat($("o-prix").value),
        categorie: $("o-cat").value.trim() || "Divers", description: $("o-desc").value.trim() || null, photo_url: photo_url
      });
      if (r.error) throw r.error;
      $("f-obj").reset(); $("o-prev").hidden = true;
      dire("o-msg", "Objet ajouté.", "ok"); chargerObjets();
    } catch (err) { dire("o-msg", "Impossible d'ajouter l'objet. Vérifiez la photo et réessayez.", "err"); }
    btn.disabled = false;
  });

  /* ---------- Marchés ---------- */
  async function chargerMarches() {
    var r = await sb.from("marches").select("*").eq("vendeur_id", user.id).gte("date", today()).order("date");
    var box = $("l-mar"); box.textContent = "";
    var l = r.data || [];
    if (!l.length) { box.appendChild(el("p", "empty", "Aucun marché à venir.")); return; }
    l.forEach(function (m) {
      var it = el("div", "it");
      var t = el("div"); t.appendChild(el("b", null, m.nom));
      t.appendChild(el("div", "meta", [dateFr(m.date), m.heures, m.lieu].filter(Boolean).join(" · ")));
      it.appendChild(t);
      var del = el("button", "btn btn-line small", "Retirer"); del.type = "button";
      del.onclick = async function () {
        var d = await sb.from("marches").delete().eq("id", m.id);
        if (d.error) alert("Suppression impossible. Réessayez."); chargerMarches();
      };
      it.appendChild(del); box.appendChild(it);
    });
  }
  $("f-mar").addEventListener("submit", async function (e) {
    e.preventDefault();
    var r = await sb.from("marches").insert({
      vendeur_id: user.id, nom: $("m-nom").value.trim(), date: $("m-date").value,
      heures: $("m-h").value.trim() || null, lieu: $("m-lieu").value.trim() || null
    });
    if (r.error) { dire("m-msg", "Impossible d'ajouter ce marché. Vérifiez les champs.", "err"); return; }
    $("f-mar").reset(); dire("m-msg", "Marché ajouté.", "ok"); chargerMarches();
  });

  /* ---------- Démarrage ---------- */
  async function aiguiller() {
    if (!user) { vendeur = null; vue("auth"); return; }
    var r = await sb.from("vendeurs").select("*").eq("id", user.id).maybeSingle();
    if (r.error) { vue("auth"); dire("a-msg", "Connexion impossible pour le moment.", "err"); return; }
    if (!r.data) { vue("creer"); return; }
    vendeur = r.data; afficherTableau();
  }
  sb.auth.onAuthStateChange(function (evt, session) {
    var u = session ? session.user : null;
    var change = (u && u.id) !== (user && user.id);
    user = u;
    if (change) setTimeout(aiguiller, 0);
  });
  sb.auth.getSession().then(function (r) {
    var u = r.data && r.data.session ? r.data.session.user : null;
    if (!user && !u) { vue("auth"); }
  });
})();
