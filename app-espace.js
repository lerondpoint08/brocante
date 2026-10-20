(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LOG = window.LOG || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {}, supa: function () {} };
  var sb = null;
  try { sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); }
  catch (e) { LOG.error("init", e); }
  var user = null, vendeur = null, mode = "in", versSite = false;
  var hash = location.hash || "";
  var recovering = /type=recovery/.test(hash);
  var lienExpire = /error_code=otp_expired|error=access_denied/.test(hash);

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
    ["auth", "creer", "tableau", "nouveau"].forEach(function (v) { $(v).hidden = v !== id; });
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

  if (!sb || !window.CONFIG || /VOTRE-/.test(CONFIG.SUPABASE_URL)) {
    LOG.error("init", "Supabase indisponible ou config.js non rempli");
    vue("auth"); dire("a-msg", "Le site n'a pas pu se charger. Rechargez la page dans un instant.", "err");
    return;
  }
  LOG.info("page", recovering ? "nouveau mot de passe" : (lienExpire ? "lien expiré" : "espace vendeur"));

  /* ---------- Connexion ---------- */
  function choisirMode(m) {
    mode = m;
    $("t-in").setAttribute("aria-pressed", m === "in");
    $("t-up").setAttribute("aria-pressed", m === "up");
    $("a-go").textContent = m === "in" ? "Se connecter" : "Créer mon compte";
    $("a-mdp").autocomplete = m === "in" ? "current-password" : "new-password";
    $("oubli").hidden = m !== "in";
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
        LOG.info("connexion", "réussie");
        versSite = true;
      } else {
        var r2 = await sb.auth.signUp({ email: email, password: mdp, options: { emailRedirectTo: location.href.split("#")[0] } });
        if (r2.error) throw r2.error;
        LOG.info("inscription", "compte créé" + (r2.data && r2.data.session ? "" : ", confirmation par e-mail attendue"));
        if (!r2.data.session) { dire("a-msg", "Compte créé. Consultez votre boîte mail et cliquez sur le lien de confirmation, puis revenez vous connecter.", "ok"); }
      }
    } catch (err) { LOG.supa(mode === "in" ? "connexion" : "inscription", err); dire("a-msg", erreurLisible(err), "err"); }
    btn.disabled = false;
  });

  $("sortir").onclick = async function () { LOG.info("déconnexion", "demandée"); await sb.auth.signOut(); };

  /* ---------- Mot de passe oublié ---------- */
  $("oubli").onclick = async function () {
    var email = $("a-mail").value.trim();
    if (!email) { dire("a-msg", "Saisissez d'abord votre adresse e-mail ci-dessus, puis touchez « Mot de passe oublié ? ».", "err"); return; }
    dire("a-msg", "Un instant…");
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (r.error) { LOG.supa("mot de passe oublié", r.error); dire("a-msg", "Impossible d'envoyer le lien pour le moment. Réessayez dans quelques minutes.", "err"); return; }
    LOG.info("mot de passe oublié", "lien demandé");
    dire("a-msg", "Si un compte existe pour cette adresse, un lien vient d'être envoyé. Ouvrez-le depuis votre boîte mail (regardez aussi les courriers indésirables).", "ok");
  };
  $("f-nouveau").addEventListener("submit", async function (e) {
    e.preventDefault();
    var a = $("n-mdp").value, b = $("n-mdp2").value;
    if (a !== b) { dire("n-msg", "Les deux mots de passe ne sont pas identiques.", "err"); return; }
    $("n-go").disabled = true; dire("n-msg", "Enregistrement…");
    var r = await sb.auth.updateUser({ password: a });
    $("n-go").disabled = false;
    if (r.error) { LOG.supa("mot de passe.changement", r.error); dire("n-msg", "Impossible de changer le mot de passe. Le lien a peut-être expiré : demandez-en un nouveau.", "err"); return; }
    LOG.info("mot de passe", "modifié");
    recovering = false; $("f-nouveau").reset(); dire("n-msg", "");
    aiguiller();
  });

  /* ---------- Création de la boutique ---------- */
  $("c-nom").addEventListener("input", function () {
    if (!$("c-slug").dataset.touche) $("c-slug").value = slugifier($("c-nom").value);
  });
  $("c-slug").addEventListener("input", function () { $("c-slug").dataset.touche = "1"; });

  $("f-creer").addEventListener("submit", async function (e) {
    e.preventDefault();
    dire("c-msg", "Création…");
    var wa = $("c-wa").value.replace(/\D/g, "");
    var ligne = { id: user.id, nom: $("c-nom").value.trim(), slug: $("c-slug").value.trim(), whatsapp: wa || null };
    var lieuC = $("c-lieu").value.trim();
    if (lieuC) ligne.lieu = lieuC;
    var r = await sb.from("vendeurs").insert(ligne).select().single();
    if (r.error) { LOG.supa("boutique.création", r.error); dire("c-msg", erreurLisible(r.error), "err"); return; }
    LOG.info("boutique", "créée");
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
    $("d-lien").textContent = lien; $("d-voir").href = lien; $("d-retour").href = lien;
    remplirBoutique(); remplirCompte();
    chargerObjets(); chargerMarches();
    var n = "objets";
    try { n = sessionStorage.getItem("brocante_onglet") || n; } catch (e) { /* ignoré */ }
    onglet(n);
  }
  $("d-copier").onclick = async function () {
    try { await navigator.clipboard.writeText(lienPublic()); $("d-copier").textContent = "Lien copié"; }
    catch (e) { $("d-copier").textContent = "Copiez le lien ci-dessus"; }
    setTimeout(function () { $("d-copier").textContent = "Copier le lien"; }, 2500);
  };

  /* ---------- Onglets de Mon espace ---------- */
  var ONGLETS = ["objets", "marches", "boutique", "compte"];
  function onglet(n) {
    if (ONGLETS.indexOf(n) < 0) n = "objets";
    ONGLETS.forEach(function (k) {
      $("p-" + k).hidden = k !== n;
      $("ong-" + k).setAttribute("aria-pressed", k === n);
    });
    try { sessionStorage.setItem("brocante_onglet", n); } catch (e) { /* ignoré */ }
    LOG.debug("onglet", n);
  }
  ONGLETS.forEach(function (k) { $("ong-" + k).onclick = function () { onglet(k); }; });

  function retirerPhotoStockee(url) {
    var m = /\/photos\/(.+)$/.exec(url || "");
    if (!m) return Promise.resolve();
    return sb.storage.from("photos").remove([decodeURIComponent(m[1])]).then(function (rm) {
      if (rm.error) LOG.supa("photo.suppression", rm.error);
    });
  }
  function colonneAbsente(err) { return err && (err.code === "42703" || err.code === "PGRST204"); }

  /* ---------- Onglet Ma boutique ---------- */
  var logoFichier = null, logoRetire = false;
  function apercuLogo() {
    var p = $("b-prev");
    if (logoFichier) { p.src = URL.createObjectURL(logoFichier); p.hidden = false; $("b-retirer").hidden = false; }
    else if (!logoRetire && vendeur && vendeur.logo_url) { p.src = vendeur.logo_url; p.hidden = false; $("b-retirer").hidden = false; }
    else { p.hidden = true; $("b-retirer").hidden = true; }
  }
  function remplirBoutique() {
    $("b-nom").value = vendeur.nom || "";
    $("b-pres").value = vendeur.presentation || "";
    $("b-wa").value = vendeur.whatsapp || "";
    $("b-lieu").value = vendeur.lieu || "";
    logoFichier = null; logoRetire = false; $("b-logo").value = "";
    dire("b-msg", ""); apercuLogo();
  }
  $("b-logo").addEventListener("change", function () {
    logoFichier = $("b-logo").files[0] || null; logoRetire = false; apercuLogo();
  });
  $("b-retirer").onclick = function () {
    logoFichier = null; logoRetire = true; $("b-logo").value = ""; apercuLogo();
  };
  $("f-boutique").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("b-go"); btn.disabled = true; dire("b-msg", "Enregistrement…");
    var nouveauLogo = null;
    try {
      var chg = {};
      var nom = $("b-nom").value.trim();
      var wa = $("b-wa").value.replace(/\D/g, "") || null;
      var lieu = $("b-lieu").value.trim() || null;
      var pres = $("b-pres").value.trim() || null;
      if (nom !== vendeur.nom) chg.nom = nom;
      if (wa !== (vendeur.whatsapp || null)) chg.whatsapp = wa;
      if (lieu !== (vendeur.lieu || null)) chg.lieu = lieu;
      if (pres !== (vendeur.presentation || null)) chg.presentation = pres;
      var ancienLogo = vendeur.logo_url || null;
      if (logoFichier) {
        var blob = await reduire(logoFichier, 400, 0.85);
        LOG.debug("logo", "réduit : " + Math.round(blob.size / 1024) + " Ko");
        var chemin = user.id + "/logo-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
        var up = await sb.storage.from("photos").upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (up.error) throw up.error;
        nouveauLogo = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
        chg.logo_url = nouveauLogo;
      } else if (logoRetire && ancienLogo) { chg.logo_url = null; }
      if (!Object.keys(chg).length) { dire("b-msg", "Aucun changement à enregistrer."); btn.disabled = false; return; }
      var r = await sb.from("vendeurs").update(chg).eq("id", user.id).select().single();
      if (r.error) throw r.error;
      LOG.info("boutique", "modifiée : " + Object.keys(chg).join(", "));
      nouveauLogo = null;
      vendeur = r.data;
      if (("logo_url" in chg) && ancienLogo) await retirerPhotoStockee(ancienLogo);
      $("d-titre").textContent = vendeur.nom;
      remplirBoutique(); remplirCompte();
      dire("b-msg", "Boutique enregistrée.", "ok");
    } catch (err) {
      LOG.supa("boutique.modification", err);
      if (nouveauLogo) await retirerPhotoStockee(nouveauLogo);
      dire("b-msg", colonneAbsente(err) ? "Cette fonction n'est pas encore activée sur le site." : "Enregistrement impossible. Vérifiez les champs et réessayez.", "err");
    }
    btn.disabled = false;
  });

  /* ---------- Onglet Mon compte ---------- */
  function remplirCompte() {
    $("u-mail").textContent = user && user.email ? user.email : "";
    if (user && user.email) $("p-user").value = user.email;
    $("s-nom").textContent = vendeur.nom;
    $("s-conf").value = ""; $("s-go").disabled = true;
    ["u-msg", "p-msg", "k-msg", "x-msg", "s-msg"].forEach(function (m) { dire(m, ""); });
  }

  $("f-mail").addEventListener("submit", async function (e) {
    e.preventDefault();
    var nv = $("u-nouveau").value.trim();
    if (!nv || (user.email && nv.toLowerCase() === user.email.toLowerCase())) { dire("u-msg", "Saisissez une adresse différente de l'actuelle.", "err"); return; }
    dire("u-msg", "Un instant…");
    var r = await sb.auth.updateUser({ email: nv }, { emailRedirectTo: location.origin + location.pathname });
    if (r.error) {
      LOG.supa("compte.email", r.error);
      var m = (r.error.message || "");
      dire("u-msg", /already|registered/i.test(m) ? "Cette adresse est déjà utilisée par un autre compte." : (/rate|seconds|too many/i.test(m) ? "Trop de demandes. Réessayez dans quelques minutes." : "Impossible de changer l'adresse pour le moment."), "err");
      return;
    }
    LOG.info("compte", "changement d'e-mail demandé");
    $("f-mail").reset();
    dire("u-msg", "Un lien de confirmation vient d'être envoyé. Ouvrez-le depuis votre boîte mail (regardez aussi l'ancienne adresse et les courriers indésirables) : l'adresse change après confirmation.", "ok");
  });

  $("f-mdp").addEventListener("submit", async function (e) {
    e.preventDefault();
    var a = $("p-actuel").value, n = $("p-nv").value, n2 = $("p-nv2").value;
    if (n !== n2) { dire("p-msg", "Les deux nouveaux mots de passe ne sont pas identiques.", "err"); return; }
    if (n.length < 8) { dire("p-msg", "Mot de passe trop court (8 caractères minimum).", "err"); return; }
    if (n === a) { dire("p-msg", "Choisissez un mot de passe différent de l'actuel.", "err"); return; }
    dire("p-msg", "Un instant…");
    var v = await sb.auth.signInWithPassword({ email: user.email, password: a });
    if (v.error) { LOG.supa("compte.mot de passe.vérification", v.error); dire("p-msg", "Le mot de passe actuel est incorrect.", "err"); return; }
    var r = await sb.auth.updateUser({ password: n });
    if (r.error) { LOG.supa("compte.mot de passe", r.error); dire("p-msg", /different|same/i.test(r.error.message || "") ? "Choisissez un mot de passe différent de l'actuel." : "Impossible de changer le mot de passe pour le moment.", "err"); return; }
    LOG.info("compte", "mot de passe modifié");
    $("p-actuel").value = ""; $("p-nv").value = ""; $("p-nv2").value = "";
    dire("p-msg", "Mot de passe modifié.", "ok");
  });

  $("k-tous").onclick = async function () {
    dire("k-msg", "Un instant…");
    var r = await sb.auth.signOut({ scope: "global" });
    if (r.error) { LOG.supa("compte.déconnexion globale", r.error); dire("k-msg", "Impossible pour le moment. Réessayez.", "err"); return; }
    LOG.info("compte", "déconnexion de tous les appareils");
  };

  $("x-data").onclick = async function () {
    dire("x-msg", "Préparation du fichier…");
    var res = await Promise.all([
      sb.from("objets").select("*").eq("vendeur_id", user.id).order("created_at"),
      sb.from("marches").select("*").eq("vendeur_id", user.id).order("date")
    ]);
    if (res[0].error || res[1].error) { LOG.supa("compte.export", res[0].error || res[1].error); dire("x-msg", "Impossible de préparer le fichier. Réessayez.", "err"); return; }
    var donnees = { exporte_le: new Date().toISOString(), compte: { email: user.email }, boutique: vendeur, objets: res[0].data || [], marches: res[1].data || [] };
    var blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
    var lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob); lien.download = "mes-donnees-brocante.json";
    document.body.appendChild(lien); lien.click(); document.body.removeChild(lien);
    setTimeout(function () { URL.revokeObjectURL(lien.href); }, 5000);
    LOG.info("compte", "export des données : " + donnees.objets.length + " objets");
    dire("x-msg", "Fichier téléchargé.", "ok");
  };

  $("s-conf").addEventListener("input", function () {
    $("s-go").disabled = $("s-conf").value.trim().toLowerCase() !== (vendeur.nom || "").trim().toLowerCase();
  });
  $("f-sup").addEventListener("submit", async function (e) {
    e.preventDefault();
    if ($("s-conf").value.trim().toLowerCase() !== (vendeur.nom || "").trim().toLowerCase()) return;
    var btn = $("s-go"); btn.disabled = true; dire("s-msg", "Suppression en cours…");
    var chemins = [];
    var ls = await sb.storage.from("photos").list(user.id, { limit: 1000 });
    if (ls.error) LOG.supa("compte.suppression.liste photos", ls.error);
    else chemins = (ls.data || []).map(function (f) { return user.id + "/" + f.name; });
    var r = await sb.rpc("supprimer_mon_compte");
    if (r.error) {
      LOG.supa("compte.suppression", r.error);
      dire("s-msg", (r.error.code === "PGRST202" || r.error.code === "42883" || r.error.status === 404) ? "Cette fonction n'est pas encore activée sur le site." : "Suppression impossible pour le moment. Réessayez.", "err");
      btn.disabled = false; return;
    }
    LOG.info("compte", "supprimé");
    if (chemins.length) {
      var rm = await sb.storage.from("photos").remove(chemins);
      if (rm.error) LOG.supa("compte.suppression.photos", rm.error);
    }
    try { await sb.auth.signOut({ scope: "local" }); } catch (err) { /* le compte n'existe plus */ }
    location.href = location.pathname.replace(/espace\.html$/, "");
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
    if (r.error) {
      LOG.supa("objets.liste", r.error);
      var bx = $("l-obj"); bx.textContent = "";
      bx.appendChild(el("p", "empty", "Impossible de charger vos objets pour le moment. Rechargez la page."));
      return;
    }
    objets = r.data || [];
    LOG.debug("objets", "chargés : " + objets.length);
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
        if (r.error) { LOG.supa("objet.état", r.error); alert("Modification impossible. Réessayez."); } else { LOG.info("objet", "état → " + sel.value); }
        chargerObjets();
      };
      act.appendChild(sel);

      var pres = o.present_date === today();
      var tg = el("button", "btn btn-line small tog", pres ? "Présent aujourd'hui" : "Marquer présent aujourd'hui");
      tg.type = "button"; tg.setAttribute("aria-pressed", pres);
      tg.onclick = async function () {
        var r = await sb.from("objets").update({ present_date: pres ? null : today() }).eq("id", o.id);
        if (r.error) { LOG.supa("objet.présence", r.error); alert("Modification impossible. Réessayez."); } else { LOG.info("objet", pres ? "présence retirée" : "marqué présent"); }
        chargerObjets();
      };
      act.appendChild(tg);

      var del = el("button", "btn btn-line small", "Supprimer"); del.type = "button";
      del.onclick = async function () {
        if (!confirm("Supprimer « " + o.nom + " » ?")) return;
        var r = await sb.from("objets").delete().eq("id", o.id);
        if (r.error) { LOG.supa("objet.suppression", r.error); alert("Suppression impossible. Réessayez."); return; }
        LOG.info("objet", "supprimé");
        var m = /\/photos\/(.+)$/.exec(o.photo_url || "");
        if (m) {
          var rm = await sb.storage.from("photos").remove([decodeURIComponent(m[1])]);
          if (rm.error) LOG.supa("photo.suppression", rm.error);
        }
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
        LOG.debug("photo choisie", (f.type || "type inconnu") + ", " + Math.round(f.size / 1024) + " Ko");
        var blob = await reduire(f, 1200, 0.82);
        LOG.debug("photo réduite", Math.round(blob.size / 1024) + " Ko");
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
      LOG.info("objet", "ajouté" + (photo_url ? " avec photo" : " sans photo"));
      $("f-obj").reset(); $("o-prev").hidden = true;
      dire("o-msg", "Objet ajouté.", "ok"); chargerObjets();
    } catch (err) { LOG.supa("objet.ajout", err); dire("o-msg", "Impossible d'ajouter l'objet. Vérifiez la photo et réessayez.", "err"); }
    btn.disabled = false;
  });

  /* ---------- Marchés ---------- */
  async function chargerMarches() {
    var r = await sb.from("marches").select("*").eq("vendeur_id", user.id).gte("date", today()).order("date");
    var box = $("l-mar"); box.textContent = "";
    if (r.error) {
      LOG.supa("marchés.liste", r.error);
      box.appendChild(el("p", "empty", "Impossible de charger vos marchés pour le moment. Rechargez la page."));
      return;
    }
    var l = r.data || [];
    LOG.debug("marchés", "chargés : " + l.length);
    if (!l.length) { box.appendChild(el("p", "empty", "Aucun marché à venir.")); return; }
    l.forEach(function (m) {
      var it = el("div", "it");
      var t = el("div"); t.appendChild(el("b", null, m.nom));
      t.appendChild(el("div", "meta", [dateFr(m.date), m.heures, m.lieu].filter(Boolean).join(" · ")));
      it.appendChild(t);
      var del = el("button", "btn btn-line small", "Retirer"); del.type = "button";
      del.onclick = async function () {
        var d = await sb.from("marches").delete().eq("id", m.id);
        if (d.error) { LOG.supa("marché.suppression", d.error); alert("Suppression impossible. Réessayez."); } else { LOG.info("marché", "retiré"); }
        chargerMarches();
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
    if (r.error) { LOG.supa("marché.ajout", r.error); dire("m-msg", "Impossible d'ajouter ce marché. Vérifiez les champs.", "err"); return; }
    LOG.info("marché", "ajouté");
    $("f-mar").reset(); dire("m-msg", "Marché ajouté.", "ok"); chargerMarches();
  });

  /* ---------- Démarrage ---------- */
  async function aiguiller() {
    if (!user) { vendeur = null; vue("auth"); return; }
    var r = await sb.from("vendeurs").select("*").eq("id", user.id).maybeSingle();
    if (r.error) { LOG.supa("boutique.lecture", r.error); vue("auth"); dire("a-msg", "Connexion impossible pour le moment.", "err"); return; }
    if (!r.data) { versSite = false; vue("creer"); return; }
    vendeur = r.data;
    if (versSite) {
      /* Juste après la saisie du mot de passe : on emmène le vendeur sur sa boutique, comme un visiteur la voit. */
      versSite = false;
      LOG.info("connexion", "redirection vers la boutique");
      location.href = location.pathname.replace(/espace\.html$/, "") + "?v=" + encodeURIComponent(vendeur.slug);
      return;
    }
    afficherTableau();
  }
  sb.auth.onAuthStateChange(function (evt, session) {
    var u = session ? session.user : null;
    LOG.debug("auth", "événement " + evt);
    var change = (u && u.id) !== (user && user.id);
    user = u;
    if (u && u.email) $("n-user").value = u.email;
    if (evt === "PASSWORD_RECOVERY") { recovering = true; setTimeout(function () { vue("nouveau"); }, 0); return; }
    if (change && !recovering) setTimeout(aiguiller, 0);
  });
  sb.auth.getSession().then(function (r) {
    if (r.error) LOG.supa("session", r.error);
    var u = r.data && r.data.session ? r.data.session.user : null;
    if (recovering) { vue("nouveau"); }
    else if (lienExpire) { vue("auth"); dire("a-msg", "Ce lien a expiré. Demandez-en un nouveau avec « Mot de passe oublié ? ».", "err"); }
    else if (!user && !u) { vue("auth"); }
  }).catch(function (e) { LOG.error("session", e); vue("auth"); });
})();
