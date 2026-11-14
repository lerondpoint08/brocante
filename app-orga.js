/* Espace organisateurs : demande de compte, annonce des brocantes, confirmation des exposants, administration. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;
  try { sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); }
  catch (e) { LOG.error("supabase", e); return; }

  var user = null, orga = null, enEdition = null;
  var VUES = ["o-auth", "o-demande", "o-statut", "o-gestion"];
  function vue(id) { VUES.forEach(function (v) { $(v).hidden = v !== id; }); $("o-pres").hidden = id !== "o-auth"; }
  function dire(id, t, type) { var m = $(id); m.textContent = t || ""; m.className = "msg" + (type ? " " + type : ""); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function bouton(txt, cls, fn) { var b = el("button", "btn small " + (cls || "btn-line"), txt); b.type = "button"; b.onclick = fn; return b; }
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function dateLongue(s) {
    var p = String(s || "").split("-");
    if (p.length !== 3) return s || "";
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function tablesAbsentes(err) { return err && (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202" || err.code === "42883"); }
  function erreur(e) {
    LOG.supa("orga", e);
    if (tablesAbsentes(e)) return "Cette fonction n'est pas encore activée sur le site.";
    return "Une erreur est survenue. Vérifiez les champs et réessayez.";
  }

  /* ---------- Connexion ---------- */
  var modeInscr = false;
  $("oa-inscr").onclick = function () {
    modeInscr = !modeInscr;
    $("oa-go").textContent = modeInscr ? "Créer mon compte" : "Se connecter";
    $("oa-inscr").textContent = modeInscr ? "J'ai déjà un compte" : "Créer un compte";
    $("oa-mdp").autocomplete = modeInscr ? "new-password" : "current-password";
    dire("oa-msg", "");
  };
  $("f-o-auth").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("oa-go"); btn.disabled = true; dire("oa-msg", "Un instant…");
    var email = $("oa-mail").value.trim(), mdp = $("oa-mdp").value;
    try {
      if (modeInscr) {
        var r = await sb.auth.signUp({ email: email, password: mdp, options: { emailRedirectTo: location.href.split("#")[0], data: { role: "organisateur" } } });
        if (r.error) throw r.error;
        if (!r.data.session) dire("oa-msg", "Compte créé. Consultez votre boîte mail et cliquez sur le lien de confirmation, puis revenez vous connecter.", "ok");
      } else {
        var r2 = await sb.auth.signInWithPassword({ email: email, password: mdp });
        if (r2.error) throw r2.error;
        dire("oa-msg", "");
      }
    } catch (err) {
      LOG.supa("orga.auth", err);
      var m = String(err && err.message || "");
      dire("oa-msg", /invalid login/i.test(m) ? "E-mail ou mot de passe incorrect." : /not confirmed/i.test(m) ? "Confirmez d'abord votre adresse avec le lien reçu par e-mail." : /registered/i.test(m) ? "Cette adresse a déjà un compte : connectez-vous." : "Connexion impossible pour le moment.", "err");
    }
    btn.disabled = false;
  });
  $("op-commencer").onclick = function (e) {
    e.preventDefault();
    if (!modeInscr) $("oa-inscr").click();
    $("o-auth").scrollIntoView({ behavior: "smooth", block: "start" }); $("oa-mail").focus();
  };
  $("op-partager").onclick = async function () {
    var url = location.href.split("#")[0].split("?")[0];
    var d = { title: "Annoncez votre brocante", text: "Organisateurs de brocantes : annoncez vos dates gratuitement et montrez vos exposants.", url: url };
    try {
      if (navigator.share) { await navigator.share(d); return; }
      await navigator.clipboard.writeText(url); dire("op-msg", "Lien copié : collez-le dans un message.", "ok");
    } catch (e) { if (e && e.name !== "AbortError") dire("op-msg", "Copiez ce lien : " + url); }
  };
  $("o-deco").onclick = async function () { await sb.auth.signOut(); };

  /* ---------- Demande d'organisateur ---------- */
  $("f-o-demande").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("od-go"); btn.disabled = true; dire("od-msg-etat", "Envoi…");
    var r = await sb.from("organisateurs").insert({
      user_id: user.id,
      nom: $("od-nom").value.trim(),
      ville: $("od-ville").value.trim(),
      contact: $("od-contact").value.trim() || null,
      message: $("od-msg").value.trim() || null,
      preuve: $("od-preuve").value.trim() || null
    });
    btn.disabled = false;
    if (r.error) { dire("od-msg-etat", erreur(r.error), "err"); return; }
    LOG.info("orga", "demande envoyée");
    aiguiller();
  });
  $("os-retirer").onclick = async function () {
    var r = await sb.from("organisateurs").delete().eq("user_id", user.id);
    if (r.error) { alert(erreur(r.error)); return; }
    aiguiller();
  };

  /* ---------- Brocantes de l'organisateur ---------- */
  function viderForm() {
    enEdition = null;
    ["ob-nom", "ob-date", "ob-heures", "ob-adresse", "ob-lien", "ob-contact", "ob-desc"].forEach(function (i) { $(i).value = ""; });
    $("ob-ville").value = orga ? orga.ville : "";
    $("ob-date").min = today();
    $("og-form-titre").textContent = "Annoncer une brocante";
    $("ob-go").textContent = "Publier la brocante";
    $("ob-annuler").hidden = true;
  }
  $("ob-annuler").onclick = function () { viderForm(); dire("ob-msg", ""); };
  function editer(b) {
    enEdition = b.id;
    $("ob-nom").value = b.nom; $("ob-date").value = b.date; $("ob-heures").value = b.heures || "";
    $("ob-ville").value = b.ville; $("ob-adresse").value = b.adresse || ""; $("ob-lien").value = b.lien_inscription || "";
    $("ob-contact").value = b.contact_inscription || ""; $("ob-desc").value = b.description || "";
    $("og-form-titre").textContent = "Modifier la brocante";
    $("ob-go").textContent = "Enregistrer les modifications";
    $("ob-annuler").hidden = false;
    $("f-brocante").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("f-brocante").addEventListener("submit", async function (e) {
    e.preventDefault();
    var lien = $("ob-lien").value.trim();
    if (lien && !/^https:\/\//i.test(lien)) {
      if (/^http:\/\//i.test(lien)) lien = lien.replace(/^http:/i, "https:"); else lien = "https://" + lien;
    }
    var v = {
      nom: $("ob-nom").value.trim(), date: $("ob-date").value, heures: $("ob-heures").value.trim() || null,
      ville: $("ob-ville").value.trim(), adresse: $("ob-adresse").value.trim() || null,
      lien_inscription: lien || null, contact_inscription: $("ob-contact").value.trim() || null,
      description: $("ob-desc").value.trim() || null
    };
    if (!enEdition && v.date < today()) { dire("ob-msg", "Choisissez une date à venir.", "err"); return; }
    var btn = $("ob-go"); btn.disabled = true; dire("ob-msg", "Enregistrement…");
    var r = enEdition
      ? await sb.from("brocantes").update(v).eq("id", enEdition)
      : await sb.from("brocantes").insert(Object.assign({ organisateur_id: user.id }, v));
    btn.disabled = false;
    if (r.error) { dire("ob-msg", erreur(r.error), "err"); return; }
    LOG.info("orga", enEdition ? "brocante modifiée" : "brocante publiée");
    dire("ob-msg", enEdition ? "Brocante modifiée." : "Brocante publiée : elle est visible sur le site.", "ok");
    viderForm(); chargerBrocantes();
  });

  var LIB = { attente: "En attente", confirme: "Confirmé", refuse: "Refusé" };
  async function decider(b, p, statut) {
    var r = statut === "retirer"
      ? await sb.from("participations").delete().eq("brocante_id", b.id).eq("vendeur_id", p.vendeur_id)
      : await sb.from("participations").update({ statut: statut }).eq("brocante_id", b.id).eq("vendeur_id", p.vendeur_id);
    if (r.error) { alert(erreur(r.error)); return; }
    chargerBrocantes();
  }
  async function chargerBrocantes() {
    var z = $("og-liste"); z.textContent = "Chargement…";
    var r = await sb.from("brocantes").select("*, participations(vendeur_id, statut, created_at, vendeurs(nom, slug, lieu))")
      .eq("organisateur_id", user.id).order("date", { ascending: true });
    z.textContent = "";
    if (r.error) { z.appendChild(el("p", "msg err", erreur(r.error))); return; }
    var l = r.data || [];
    if (!l.length) { z.appendChild(el("p", "empty", "Aucune brocante annoncée pour l'instant.")); return; }
    var auj = today(), JOURS_RAPPEL = 3, enRetard = [];
    l.forEach(function (b) {
      if (b.date < auj) return;
      var n = (b.participations || []).filter(function (p) { return p.statut === "attente" && (Date.now() - Date.parse(p.created_at)) > JOURS_RAPPEL * 86400000; }).length;
      if (n) enRetard.push({ b: b, n: n });
    });
    var rap = $("og-rappel"); rap.textContent = "";
    if (enRetard.length) {
      rap.appendChild(el("p", "orga-rappel-titre", "⏳ Des brocanteurs attendent votre réponse depuis plus de " + JOURS_RAPPEL + " jours :"));
      var ulr = el("ul");
      enRetard.forEach(function (x) { ulr.appendChild(el("li", null, x.b.nom + " (" + dateLongue(x.b.date) + ") : " + x.n + " en attente")); });
      rap.appendChild(ulr);
      rap.appendChild(el("p", "note", "Confirmez ceux qui ont réservé et refusez les autres : ils sont prévenus sur leur espace."));
    }
    rap.hidden = !enRetard.length;
    l.forEach(function (b) {
      var c = el("article", "card brocante-orga" + (b.date < auj ? " passee" : ""));
      c.appendChild(el("h3", "", b.nom));
      c.appendChild(el("p", "meta", dateLongue(b.date) + (b.heures ? " · " + b.heures : "")));
      c.appendChild(el("p", "meta", [b.adresse, b.ville].filter(Boolean).join(", ")));
      var act = el("div", "ban-actions");
      act.appendChild(bouton("Modifier", "", function () { editer(b); }));
      act.appendChild(bouton("Supprimer", "", async function () {
        if (!confirm("Supprimer « " + b.nom + " » ? Les exposants inscrits seront retirés.")) return;
        var rd = await sb.from("brocantes").delete().eq("id", b.id);
        if (rd.error) { alert(erreur(rd.error)); return; }
        chargerBrocantes();
      }));
      c.appendChild(act);
      var ps = (b.participations || []).slice().sort(function (x, y) { return (x.statut === "attente" ? 0 : 1) - (y.statut === "attente" ? 0 : 1); });
      var att = ps.filter(function (p) { return p.statut === "attente"; }).length;
      var conf = ps.filter(function (p) { return p.statut === "confirme"; }).length;
      c.appendChild(el("p", "orga-compte", conf + " exposant" + (conf > 1 ? "s" : "") + " confirmé" + (conf > 1 ? "s" : "") + (att ? " · " + att + " en attente" : "")));
      if (ps.length) {
        var ul = el("ul", "orga-exposants");
        ps.forEach(function (p) {
          var li = el("li", "st-" + p.statut);
          var a = el("a", "", (p.vendeurs && p.vendeurs.nom) || "Boutique");
          a.href = "./?v=" + encodeURIComponent((p.vendeurs && p.vendeurs.slug) || ""); a.target = "_blank"; a.rel = "noopener";
          li.appendChild(a);
          if (p.vendeurs && p.vendeurs.lieu) li.appendChild(el("span", "lieu", " · " + p.vendeurs.lieu));
          li.appendChild(el("span", "etiquette-st", LIB[p.statut]));
          if (p.statut === "attente") {
            var j = Math.floor((Date.now() - Date.parse(p.created_at)) / 86400000);
            li.appendChild(el("span", "orga-depuis" + (j >= 3 ? " retard" : ""), j < 1 ? "aujourd'hui" : "depuis " + j + " jour" + (j > 1 ? "s" : "")));
          }
          var bx = el("span", "orga-boutons");
          if (p.statut !== "confirme") bx.appendChild(bouton("Confirmer", "btn-gold", function () { decider(b, p, "confirme"); }));
          if (p.statut === "attente") bx.appendChild(bouton("Refuser", "", function () { decider(b, p, "refuse"); }));
          if (p.statut === "confirme") bx.appendChild(bouton("Retirer", "", function () { if (confirm("Retirer " + ((p.vendeurs && p.vendeurs.nom) || "ce brocanteur") + " des exposants ?")) decider(b, p, "retirer"); }));
          li.appendChild(bx);
          ul.appendChild(li);
        });
        c.appendChild(ul);
      }
      z.appendChild(c);
    });
  }

  /* ---------- Administration ---------- */
  var LIB_ORGA = { attente: "En attente", valide: "Validé", refuse: "Refusé" };
  async function chargerAdmin() {
    var ra = await sb.rpc("est_admin");
    if (ra.error || !ra.data) { $("o-admin").hidden = true; return; }
    $("o-admin").hidden = false;
    var z = $("adm-liste"); z.textContent = "Chargement…";
    var r = await sb.rpc("admin_demandes");
    z.textContent = "";
    if (r.error) { z.appendChild(el("p", "msg err", erreur(r.error))); return; }
    var l = r.data || [];
    if (!l.length) { z.appendChild(el("p", "empty", "Aucune demande pour l'instant.")); return; }
    l.forEach(function (d) {
      var c = el("div", "adm-demande st-" + d.statut);
      var h = el("p", "adm-nom"); h.appendChild(el("strong", "", d.nom)); h.appendChild(document.createTextNode(" · " + d.ville + " "));
      h.appendChild(el("span", "etiquette-st", LIB_ORGA[d.statut])); c.appendChild(h);
      c.appendChild(el("p", "meta", (d.email || "") + (d.contact ? " · " + d.contact : "") + " · demandé le " + new Date(d.created_at).toLocaleDateString("fr-FR")));
      if (d.preuve) {
        var pr = el("p", "adm-preuve"); pr.appendChild(el("b", null, "Preuve : "));
        if (/^https?:\/\//i.test(d.preuve)) { var la = el("a", null, d.preuve); la.href = d.preuve; la.target = "_blank"; la.rel = "noopener noreferrer"; pr.appendChild(la); }
        else pr.appendChild(document.createTextNode(d.preuve));
        c.appendChild(pr);
      }
      if (d.message) c.appendChild(el("p", "adm-msg", d.message));
      var act = el("div", "ban-actions");
      async function dec(s) {
        var rr = await sb.rpc("admin_decider", { cible: d.user_id, decision: s });
        if (rr.error) { alert(erreur(rr.error)); return; }
        LOG.info("admin", "organisateur " + s);
        chargerAdmin(); if (d.user_id === user.id) aiguiller();
      }
      if (d.statut !== "valide") act.appendChild(bouton("Valider", "btn-gold", function () { dec("valide"); }));
      if (d.statut !== "refuse") act.appendChild(bouton("Refuser", "", function () { dec("refuse"); }));
      c.appendChild(act);
      z.appendChild(c);
    });
  }

  /* ---------- Aiguillage ---------- */
  async function aiguiller() {
    $("o-deco").hidden = !user;
    if (!user) { $("o-admin").hidden = true; vue("o-auth"); return; }
    chargerAdmin();
    var r = await sb.from("organisateurs").select("user_id,nom,ville,statut").eq("user_id", user.id).maybeSingle();
    if (r.error) {
      vue("o-statut"); $("os-titre").textContent = "Bientôt disponible";
      $("os-texte").textContent = tablesAbsentes(r.error) ? "L'espace organisateurs n'est pas encore activé sur le site. Revenez un peu plus tard." : erreur(r.error);
      $("os-retirer").hidden = true; return;
    }
    orga = r.data;
    if (!orga) { vue("o-demande"); return; }
    if (orga.statut === "valide") { vue("o-gestion"); viderForm(); chargerBrocantes(); return; }
    vue("o-statut");
    $("os-retirer").hidden = false;
    if (orga.statut === "attente") {
      $("os-titre").textContent = "Demande en cours de vérification";
      $("os-texte").textContent = "Merci ! Votre demande pour « " + orga.nom + " » (" + orga.ville + ") a bien été reçue. Vous pourrez annoncer vos brocantes dès qu'elle sera validée.";
    } else {
      $("os-titre").textContent = "Demande non retenue";
      $("os-texte").textContent = "Votre demande n'a pas été validée. Si c'est une erreur, écrivez-nous avec le lien « Aide et suggestions » du site, ou retirez cette demande pour en faire une nouvelle.";
    }
  }
  sb.auth.onAuthStateChange(function (evt, session) {
    var u = session ? session.user : null;
    if ((u && u.id) !== (user && user.id)) { user = u; setTimeout(aiguiller, 0); }
  });
  sb.auth.getSession().then(function (r) {
    var u = r.data && r.data.session ? r.data.session.user : null;
    if (!u && !user) aiguiller();
  });
})();
