(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TR = window.I18N.t, TN = window.I18N.tn;
  window.I18N.avantChangement(function (code) { return user ? sb.auth.updateUser({ data: { langue: code } }) : null; });
  function prixTxt(p) { return TR("prix", { n: Number(p).toLocaleString(window.I18N.locale()) }); }
  function libCat(c) { return window.I18N.lib("cat", c); }
  function estSansTitre(n) { return n === "Objet sans titre" || n === "Untitled item"; }
  var LOG = window.LOG || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {}, supa: function () {} };
  var sb = null;
  try { sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); }
  catch (e) { LOG.error("init", e); }
  var user = null, vendeur = null, mode = "in", versSite = false;
  var params = new URLSearchParams(location.search);
  var visiteurParam = params.get("visiteur") === "1";
  var retourParam = /^\?v=[A-Za-z0-9-]+$/.test(params.get("retour") || "") ? params.get("retour") : "";
  function estVisiteur(u) { return !!(u && u.user_metadata && u.user_metadata.role === "visiteur"); }
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
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(window.I18N.locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  /* Contrôle des adresses e-mail : adresses jetables refusées, fautes de frappe courantes signalées.
     (La vraie vérification reste le lien de confirmation envoyé par e-mail.) */
  var JETABLES = ["mailinator.com","yopmail.com","yopmail.fr","guerrillamail.com","guerrillamail.net","guerrillamail.org","sharklasers.com","10minutemail.com","10minutemail.net","tempmail.com","temp-mail.org","temp-mail.io","tempmail.net","trashmail.com","trashmail.net","getnada.com","dispostable.com","maildrop.cc","throwawaymail.com","fakeinbox.com","mailnesia.com","mohmal.com","emailondeck.com","spamgourmet.com","mintemail.com","discard.email","moakt.com","burnermail.io","tempr.email","mytemp.email","mail.tm","getairmail.com","mailcatch.com","spam4.me","grr.la","guerrillamailblock.com","yopmail.net","cool.fr.nf","jetable.org","nospam.ze.tc"];
  var COURANTS = ["gmail.com","hotmail.com","hotmail.fr","outlook.com","outlook.fr","yahoo.com","yahoo.fr","orange.fr","wanadoo.fr","free.fr","sfr.fr","laposte.net","icloud.com","live.fr","live.com","neuf.fr","bbox.fr","aol.com","protonmail.com","proton.me","me.com","msn.com"];
  function distance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 1; j <= b.length; j++) { d[0][j] = j; }
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /* Renvoie { bloque: "message" } ou { suggestion: "adresse corrigée" } ou null. */
  function controleMail(adresse) {
    var m = adresse.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+\.[^@\s]{2,})$/);
    if (!m) return { bloque: TR("Cette adresse e-mail ne semble pas valide. Vérifiez-la.") };
    var dom = m[2];
    if (JETABLES.indexOf(dom) >= 0) return { bloque: TR("Les adresses e-mail jetables ne sont pas acceptées. Utilisez votre adresse habituelle.") };
    if (COURANTS.indexOf(dom) >= 0) return null;
    var meilleur = null, dm = 3;
    COURANTS.forEach(function (c) { var d = distance(dom, c); if (d < dm && d <= 2) { dm = d; meilleur = c; } });
    return meilleur ? { suggestion: m[1] + "@" + meilleur } : null;
  }
  /* Affiche « Vouliez-vous écrire … ? » avec deux boutons ; suite() est appelée si la personne confirme son adresse. */
  function proposerCorrection(idMsg, champ, suggestion, suite) {
    var m = $(idMsg); m.textContent = ""; m.className = "msg err";
    m.appendChild(document.createTextNode(TR("Vouliez-vous écrire {s} ? ", { s: suggestion })));
    var oui = document.createElement("button"); oui.type = "button"; oui.className = "btn btn-gold small"; oui.textContent = TR("Oui, corriger");
    var non = document.createElement("button"); non.type = "button"; non.className = "btn btn-line small"; non.textContent = TR("Non, c'est correct");
    oui.onclick = function () { $(champ).value = suggestion; m.textContent = ""; m.className = "msg"; };
    non.onclick = function () { m.textContent = ""; m.className = "msg"; suite(); };
    m.appendChild(oui); m.appendChild(document.createTextNode(" ")); m.appendChild(non);
  }
  function vue(id) {
    ["auth", "creer", "tableau", "nouveau"].forEach(function (v) { $(v).hidden = v !== id; });
    $("sortir").hidden = id === "auth";
  }
  function initiale(n) {
    var m = String(n || "").trim().match(/[A-Za-zÀ-ÿ0-9]/);
    return m ? m[0].toUpperCase() : "B";
  }
  function majAvatar(nom, url) {
    var s = $("d-av"); s.textContent = ""; s.className = "avatar av-d"; s.setAttribute("aria-hidden", "true");
    if (url && /^https:\/\//.test(url)) {
      var im = el("img"); im.src = url; im.alt = "";
      im.onerror = function () { im.remove(); s.textContent = initiale(nom); };
      s.appendChild(im);
    } else { s.textContent = initiale(nom); }
  }
  /* Règles du nom de la boutique : les mêmes sont vérifiées côté base de données, qui fait foi. */
  var DELAI_NOM_JOURS = 7;
  function verifierNom(n) {
    if (n.length < 2 || n.length > 80) return TR("Le nom doit faire entre 2 et 80 caractères.");
    if (/(https?:|www\.|@|\.(com|fr|net|org|io|xyz|info)\b)/i.test(n)) return TR("Le nom ne peut pas contenir d'adresse internet ou d'e-mail.");
    if (!/[A-Za-zÀ-ÿ0-9]/.test(n)) return TR("Le nom doit contenir au moins une lettre ou un chiffre.");
    if (/(admin|moderat|modérat|support|officiel)/i.test(n)) return TR("Ce nom n'est pas autorisé : il pourrait faire croire à un compte officiel du site.");
    return null;
  }
  function erreurNom(e) {
    var m = (e && (e.message || "")) + " " + (e && e.details || "");
    if (/NOM_TROP_RECENT/.test(m)) return TR("Vous avez déjà renommé votre boutique récemment. Réessayez dans quelques jours.");
    if (/NOM_LIEN/.test(m)) return TR("Le nom ne peut pas contenir d'adresse internet ou d'e-mail.");
    if (/NOM_SYMBOLES/.test(m)) return TR("Le nom doit contenir au moins une lettre ou un chiffre.");
    if (/NOM_RESERVE/.test(m)) return TR("Ce nom n'est pas autorisé : il pourrait faire croire à un compte officiel du site.");
    if (/NOM_LONGUEUR/.test(m)) return TR("Le nom doit faire entre 2 et 80 caractères.");
    if (/vendeurs_nom_unique/.test(m)) return TR("Ce nom de boutique est déjà pris. Choisissez-en un autre.");
    return null;
  }
  function slugifier(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }
  function erreurLisible(e) {
    var m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return TR("E-mail ou mot de passe incorrect.");
    if (/already registered|already been registered/i.test(m)) return TR("Un compte existe déjà avec cet e-mail. Utilisez « Se connecter ».");
    var nomErr = erreurNom(e);
    if (nomErr) return nomErr;
    if (/duplicate key|unique/i.test(m)) return TR("Cette adresse de boutique est déjà prise. Essayez-en une autre.");
    if (/Email not confirmed/i.test(m)) return TR("Confirmez d'abord votre e-mail (cliquez sur le lien reçu par courriel).");
    if (/Password should/i.test(m)) return TR("Mot de passe trop court (8 caractères minimum).");
    return TR("Une erreur est survenue. Réessayez dans un instant.");
  }

  if (!sb || !window.CONFIG || /VOTRE-/.test(CONFIG.SUPABASE_URL)) {
    LOG.error("init", "Supabase indisponible ou config.js non rempli");
    vue("auth"); dire("a-msg", TR("Le site n'a pas pu se charger. Rechargez la page dans un instant."), "err");
    return;
  }
  LOG.info("page", recovering ? "nouveau mot de passe" : (lienExpire ? "lien expiré" : "espace vendeur"));

  /* ---------- Connexion ---------- */
  function choisirMode(m) {
    mode = m;
    $("t-in").setAttribute("aria-pressed", m === "in");
    $("t-up").setAttribute("aria-pressed", m === "up");
    $("a-go").textContent = m === "in" ? TR("Se connecter") : TR("Créer mon compte");
    $("a-mdp").autocomplete = m === "in" ? "current-password" : "new-password";
    $("oubli").hidden = m !== "in";
    dire("a-msg", "");
  }
  $("t-in").onclick = function () { choisirMode("in"); };
  if (visiteurParam) {
    $("a-titre").textContent = TR("Un compte pour contacter les vendeurs");
    $("a-lead").textContent = TR("Créez un compte gratuit (ou connectez-vous) pour écrire aux vendeurs. Cela protège les vendeurs des messages indésirables.");
    choisirMode(params.get("mode") === "in" ? "in" : "up");
  }
  $("t-up").onclick = function () { choisirMode("up"); };

  var mailVerifie = "";
  $("f-auth").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (mode === "up") {
      var cm = controleMail($("a-mail").value);
      if (cm && cm.bloque) { dire("a-msg", cm.bloque, "err"); return; }
      if (cm && cm.suggestion && mailVerifie !== $("a-mail").value.trim()) {
        proposerCorrection("a-msg", "a-mail", cm.suggestion, function () { mailVerifie = $("a-mail").value.trim(); $("f-auth").requestSubmit(); });
        return;
      }
    }
    var btn = $("a-go"); btn.disabled = true; dire("a-msg", TR("Un instant…"));
    var email = $("a-mail").value.trim(), mdp = $("a-mdp").value;
    try {
      if (mode === "in") {
        var r = await sb.auth.signInWithPassword({ email: email, password: mdp });
        if (r.error) throw r.error;
        LOG.info("connexion", "réussie");
        versSite = true;
      } else {
        var r2 = await sb.auth.signUp({ email: email, password: mdp, options: { emailRedirectTo: location.href.split("#")[0], data: visiteurParam ? { role: "visiteur", langue: window.I18N.lang() } : { langue: window.I18N.lang() } } });
        if (r2.error) throw r2.error;
        LOG.info("inscription", "compte créé" + (r2.data && r2.data.session ? "" : ", confirmation par e-mail attendue"));
        if (!r2.data.session) { dire("a-msg", TR("Compte créé. Consultez votre boîte mail et cliquez sur le lien de confirmation, puis revenez vous connecter."), "ok"); }
      }
    } catch (err) { LOG.supa(mode === "in" ? "connexion" : "inscription", err); dire("a-msg", erreurLisible(err), "err"); }
    btn.disabled = false;
  });

  $("sortir").onclick = async function () { LOG.info("déconnexion", "demandée"); await sb.auth.signOut(); };

  /* ---------- Mot de passe oublié ---------- */
  $("oubli").onclick = async function () {
    var email = $("a-mail").value.trim();
    if (!email) { dire("a-msg", TR("Saisissez d'abord votre adresse e-mail ci-dessus, puis touchez « Mot de passe oublié ? »."), "err"); return; }
    dire("a-msg", TR("Un instant…"));
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (r.error) { LOG.supa("mot de passe oublié", r.error); dire("a-msg", TR("Impossible d'envoyer le lien pour le moment. Réessayez dans quelques minutes."), "err"); return; }
    LOG.info("mot de passe oublié", "lien demandé");
    dire("a-msg", TR("Si un compte existe pour cette adresse, un lien vient d'être envoyé. Ouvrez-le depuis votre boîte mail (regardez aussi les courriers indésirables)."), "ok");
  };
  $("f-nouveau").addEventListener("submit", async function (e) {
    e.preventDefault();
    var a = $("n-mdp").value, b = $("n-mdp2").value;
    if (a !== b) { dire("n-msg", TR("Les deux mots de passe ne sont pas identiques."), "err"); return; }
    $("n-go").disabled = true; dire("n-msg", TR("Enregistrement…"));
    var r = await sb.auth.updateUser({ password: a });
    $("n-go").disabled = false;
    if (r.error) { LOG.supa("mot de passe.changement", r.error); dire("n-msg", TR("Impossible de changer le mot de passe. Le lien a peut-être expiré : demandez-en un nouveau."), "err"); return; }
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
    dire("c-msg", TR("Création…"));
    var wa = $("c-wa").value.replace(/\D/g, "");
    var nomC = $("c-nom").value.trim().replace(/\s+/g, " ");
    var pbC = verifierNom(nomC);
    if (pbC) { dire("c-msg", pbC, "err"); return; }
    var ligne = { id: user.id, nom: nomC, slug: $("c-slug").value.trim(), whatsapp: wa || null };
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
    $("d-titre").textContent = vendeur.nom; majAvatar(vendeur.nom, vendeur.logo_url);
    var lien = lienPublic();
    $("d-lien").textContent = lien; $("d-voir").href = lien; $("d-retour").href = lien;
    remplirBoutique(); remplirCompte();
    chargerObjets(); chargerMarches();
    var n = "objets";
    try { n = sessionStorage.getItem("brocante_onglet") || n; } catch (e) { /* ignoré */ }
    onglet(n);
  }
  $("d-copier").onclick = async function () {
    try { await navigator.clipboard.writeText(lienPublic()); $("d-copier").textContent = TR("Lien copié"); }
    catch (e) { $("d-copier").textContent = TR("Copiez le lien ci-dessus"); }
    setTimeout(function () { $("d-copier").textContent = TR("Copier le lien"); }, 2500);
  };

  /* ---------- Onglets de Mon espace ---------- */
  var ONGLETS = ["objets", "rapide", "marches", "boutique", "affichage", "tutoriel", "compte"];
  var ongletActuel = "objets";
  function onglet(n) {
    if (ONGLETS.indexOf(n) < 0) n = "objets";
    ongletActuel = n;
    if (n !== "rapide" && typeof arreterCamera === "function") arreterCamera();
    if (n === "rapide" && typeof chargerBrouillons === "function") chargerBrouillons();
    if (n === "affichage" && typeof dessinerAffichage === "function") dessinerAffichage();
    ONGLETS.forEach(function (k) {
      $("p-" + k).hidden = k !== n;
      $("ong-" + k).setAttribute("aria-pressed", k === n);
    });
    try { sessionStorage.setItem("brocante_onglet", n); } catch (e) { /* ignoré */ }
    LOG.debug("onglet", n);
  }

  /* ---------- Avertissement avant de quitter un onglet non enregistré ---------- */
  var NOMS_ONGLETS = { objets: TR("Ajouter un objet"), rapide: TR("Saisie rapide"), marches: TR("Mes marchés"), boutique: TR("Ma boutique"), compte: TR("Mon compte") };
  function rempli(ids) { return ids.some(function (i) { return $(i).value.trim() !== ""; }); }
  function modifie(n) {
    if (n === "objets") return rempli(["o-nom", "o-prix", "o-cat", "o-desc"]) || fichiers.length > 0;
    if (n === "rapide") return typeof enCours === "function" && enCours() > 0;
    if (n === "marches") return rempli(["m-nom", "m-date", "m-h", "m-lieu"]);
    if (n === "boutique") {
      if (!vendeur) return false;
      var nom = $("b-nom").value.trim().replace(/\s+/g, " ");
      var wa = $("b-wa").value.replace(/\D/g, "");
      return (!$("b-nom").disabled && nom !== vendeur.nom) ||
        $("b-pres").value.trim() !== (vendeur.presentation || "") ||
        wa !== (vendeur.whatsapp || "") ||
        $("b-lieu").value.trim() !== (vendeur.lieu || "") ||
        !!logoFichier || logoRetire;
    }
    if (n === "compte") {
      /* L'ancien mot de passe seul n'est pas compté : un gestionnaire de mots de passe peut le remplir tout seul. */
      var mail = $("u-nouveau").value.trim().toLowerCase();
      return (mail !== "" && mail !== ((user && user.email) || "").toLowerCase()) || rempli(["p-nv", "p-nv2"]);
    }
    return false;
  }
  function reinitialiser(n) {
    if (n === "objets") { $("f-obj").reset(); viderPhotos(); dire("o-msg", ""); }
    else if (n === "marches") { $("f-mar").reset(); dire("m-msg", ""); }
    else if (n === "boutique") { remplirBoutique(); }
    else if (n === "compte") { $("f-mail").reset(); $("f-mdp").reset(); remplirCompte(); }
  }
  var apresGarde = null;
  function demanderConfirmation(n, suite) {
    $("g-texte").textContent = TR("Ce que vous avez saisi dans « {nom} » n'est pas enregistré. Si vous changez d'onglet maintenant, ces informations seront perdues.", { nom: NOMS_ONGLETS[n] });
    apresGarde = suite;
    $("garde").hidden = false; document.body.style.overflow = "hidden";
    $("g-rester").focus();
    LOG.debug("onglet", "avertissement : modifications non enregistrées dans " + n);
  }
  function fermerGarde() { $("garde").hidden = true; document.body.style.overflow = ""; apresGarde = null; }
  $("g-rester").onclick = fermerGarde;
  $("g-quitter").onclick = function () { var f = apresGarde; fermerGarde(); if (f) f(); };
  $("garde").addEventListener("click", function (ev) { if (ev.target === $("garde")) fermerGarde(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("garde").hidden) fermerGarde(); });
  ONGLETS.forEach(function (k) {
    $("ong-" + k).onclick = function () {
      if (k === ongletActuel) return;
      var depuis = ongletActuel;
      if (modifie(depuis)) demanderConfirmation(depuis, function () { reinitialiser(depuis); onglet(k); });
      else onglet(k);
    };
  });
  /* Même protection si on ferme la page ou qu'on clique sur un lien (ex. « Retour à ma boutique »). */
  window.addEventListener("beforeunload", function (ev) {
    if (!$("tableau").hidden && ONGLETS.some(modifie)) { ev.preventDefault(); ev.returnValue = ""; return ""; }
  });

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
    var nom = ($("b-nom").value || (vendeur && vendeur.nom) || "").trim();
    $("b-titre").textContent = nom; $("b-init").textContent = (nom.match(/[A-Za-zÀ-ÿ0-9]/) || ["?"])[0].toUpperCase();
    if (logoFichier) { p.src = URL.createObjectURL(logoFichier); p.hidden = false; $("b-init").hidden = true; $("b-retirer").hidden = false; }
    else if (!logoRetire && vendeur && vendeur.logo_url) { p.src = vendeur.logo_url; p.hidden = false; $("b-init").hidden = true; $("b-retirer").hidden = false; }
    else { p.hidden = true; $("b-init").hidden = false; $("b-retirer").hidden = true; }
  }
  function remplirBoutique() {
    $("b-nom").value = vendeur.nom || "";
    var suivant = vendeur.nom_modifie_le ? new Date(Date.parse(vendeur.nom_modifie_le) + DELAI_NOM_JOURS * 86400000) : null;
    if (suivant && suivant.getTime() > Date.now()) {
      $("b-nom").disabled = true;
      $("b-nom-note").textContent = TR("Vous pourrez renommer votre boutique à partir du {d}.", { d: suivant.toLocaleDateString(window.I18N.locale(), { day: "numeric", month: "long", year: "numeric" }) });
    } else {
      $("b-nom").disabled = false;
      $("b-nom-note").textContent = TR("Vous pouvez renommer votre boutique une fois tous les {n} jours. Pas d'adresse internet ni d'e-mail dans le nom.", { n: DELAI_NOM_JOURS });
    }
    $("b-pres").value = vendeur.presentation || "";
    $("b-wa").value = vendeur.whatsapp || "";
    $("b-lieu").value = vendeur.lieu || "";
    logoFichier = null; logoRetire = false; $("b-logo").value = "";
    dire("b-msg", ""); apercuLogo();
  }
  $("b-crayon").onclick = function () { $("b-logo").click(); };
  $("b-av").onclick = function () { $("b-logo").click(); };
  $("b-nom").addEventListener("input", apercuLogo);
  $("b-logo").addEventListener("change", function () {
    logoFichier = $("b-logo").files[0] || null; logoRetire = false; apercuLogo();
  });
  $("b-retirer").onclick = function () {
    logoFichier = null; logoRetire = true; $("b-logo").value = ""; apercuLogo();
  };
  $("f-boutique").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("b-go"); btn.disabled = true; dire("b-msg", TR("Enregistrement…"));
    var nouveauLogo = null;
    try {
      var chg = {};
      var nom = $("b-nom").value.trim().replace(/\s+/g, " ");
      if (nom !== vendeur.nom) {
        var pb = verifierNom(nom);
        if (pb) { dire("b-msg", pb, "err"); btn.disabled = false; return; }
      }
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
        LOG.debug("photo de profil", "réduite : " + Math.round(blob.size / 1024) + " Ko");
        var chemin = user.id + "/logo-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
        var up = await sb.storage.from("photos").upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (up.error) throw up.error;
        nouveauLogo = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
        chg.logo_url = nouveauLogo;
      } else if (logoRetire && ancienLogo) { chg.logo_url = null; }
      if (!Object.keys(chg).length) { dire("b-msg", TR("Aucun changement à enregistrer.")); btn.disabled = false; return; }
      var r = await sb.from("vendeurs").update(chg).eq("id", user.id).select().single();
      if (r.error) throw r.error;
      LOG.info("boutique", "modifiée : " + Object.keys(chg).join(", "));
      nouveauLogo = null;
      vendeur = r.data;
      if (("logo_url" in chg) && ancienLogo) await retirerPhotoStockee(ancienLogo);
      $("d-titre").textContent = vendeur.nom; majAvatar(vendeur.nom, vendeur.logo_url);
      remplirBoutique(); remplirCompte();
      dire("b-msg", TR("Boutique enregistrée."), "ok");
    } catch (err) {
      LOG.supa("boutique.modification", err);
      if (nouveauLogo) await retirerPhotoStockee(nouveauLogo);
      dire("b-msg", erreurNom(err) || (colonneAbsente(err) ? TR("Cette fonction n'est pas encore activée sur le site.") : TR("Enregistrement impossible. Vérifiez les champs et réessayez.")), "err");
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

  var mailVerifieCompte = "";
  $("f-mail").addEventListener("submit", async function (e) {
    e.preventDefault();
    var nv = $("u-nouveau").value.trim();
    if (!nv || (user.email && nv.toLowerCase() === user.email.toLowerCase())) { dire("u-msg", TR("Saisissez une adresse différente de l'actuelle."), "err"); return; }
    var cm = controleMail(nv);
    if (cm && cm.bloque) { dire("u-msg", cm.bloque, "err"); return; }
    if (cm && cm.suggestion && mailVerifieCompte !== nv) {
      proposerCorrection("u-msg", "u-nouveau", cm.suggestion, function () { mailVerifieCompte = nv; $("f-mail").requestSubmit(); });
      return;
    }
    dire("u-msg", TR("Un instant…"));
    var r = await sb.auth.updateUser({ email: nv }, { emailRedirectTo: location.origin + location.pathname });
    if (r.error) {
      LOG.supa("compte.email", r.error);
      var m = (r.error.message || "");
      dire("u-msg", /already|registered/i.test(m) ? TR("Cette adresse est déjà utilisée par un autre compte.") : (/rate|seconds|too many/i.test(m) ? TR("Trop de demandes. Réessayez dans quelques minutes.") : TR("Impossible de changer l'adresse pour le moment.")), "err");
      return;
    }
    LOG.info("compte", "changement d'e-mail demandé");
    $("f-mail").reset();
    dire("u-msg", TR("Un lien de confirmation vient d'être envoyé. Ouvrez-le depuis votre boîte mail (regardez aussi l'ancienne adresse et les courriers indésirables) : l'adresse change après confirmation."), "ok");
  });

  $("f-mdp").addEventListener("submit", async function (e) {
    e.preventDefault();
    var a = $("p-actuel").value, n = $("p-nv").value, n2 = $("p-nv2").value;
    if (n !== n2) { dire("p-msg", TR("Les deux nouveaux mots de passe ne sont pas identiques."), "err"); return; }
    if (n.length < 8) { dire("p-msg", TR("Mot de passe trop court (8 caractères minimum)."), "err"); return; }
    if (n === a) { dire("p-msg", TR("Choisissez un mot de passe différent de l'actuel."), "err"); return; }
    dire("p-msg", TR("Un instant…"));
    var v = await sb.auth.signInWithPassword({ email: user.email, password: a });
    if (v.error) { LOG.supa("compte.mot de passe.vérification", v.error); dire("p-msg", TR("Le mot de passe actuel est incorrect."), "err"); return; }
    var r = await sb.auth.updateUser({ password: n });
    if (r.error) { LOG.supa("compte.mot de passe", r.error); dire("p-msg", /different|same/i.test(r.error.message || "") ? TR("Choisissez un mot de passe différent de l'actuel.") : TR("Impossible de changer le mot de passe pour le moment."), "err"); return; }
    LOG.info("compte", "mot de passe modifié");
    $("p-actuel").value = ""; $("p-nv").value = ""; $("p-nv2").value = "";
    dire("p-msg", TR("Mot de passe modifié."), "ok");
  });

  $("k-tous").onclick = async function () {
    dire("k-msg", TR("Un instant…"));
    var r = await sb.auth.signOut({ scope: "global" });
    if (r.error) { LOG.supa("compte.déconnexion globale", r.error); dire("k-msg", TR("Impossible pour le moment. Réessayez."), "err"); return; }
    LOG.info("compte", "déconnexion de tous les appareils");
  };

  $("x-data").onclick = async function () {
    dire("x-msg", TR("Préparation du fichier…"));
    var res = await Promise.all([
      sb.from("objets").select("*").eq("vendeur_id", user.id).order("created_at"),
      sb.from("marches").select("*").eq("vendeur_id", user.id).order("date")
    ]);
    if (res[0].error || res[1].error) { LOG.supa("compte.export", res[0].error || res[1].error); dire("x-msg", TR("Impossible de préparer le fichier. Réessayez."), "err"); return; }
    var donnees = { exporte_le: new Date().toISOString(), compte: { email: user.email }, boutique: vendeur, objets: res[0].data || [], marches: res[1].data || [] };
    var blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
    var lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob); lien.download = "mes-donnees-brocante.json";
    document.body.appendChild(lien); lien.click(); document.body.removeChild(lien);
    setTimeout(function () { URL.revokeObjectURL(lien.href); }, 5000);
    LOG.info("compte", "export des données : " + donnees.objets.length + " objets");
    dire("x-msg", TR("Fichier téléchargé."), "ok");
  };

  $("s-conf").addEventListener("input", function () {
    $("s-go").disabled = $("s-conf").value.trim().toLowerCase() !== (vendeur.nom || "").trim().toLowerCase();
  });
  $("f-sup").addEventListener("submit", async function (e) {
    e.preventDefault();
    if ($("s-conf").value.trim().toLowerCase() !== (vendeur.nom || "").trim().toLowerCase()) return;
    var btn = $("s-go"); btn.disabled = true; dire("s-msg", TR("Suppression en cours…"));
    var chemins = [];
    var ls = await sb.storage.from("photos").list(user.id, { limit: 1000 });
    if (ls.error) LOG.supa("compte.suppression.liste photos", ls.error);
    else chemins = (ls.data || []).map(function (f) { return user.id + "/" + f.name; });
    var r = await sb.rpc("supprimer_mon_compte");
    if (r.error) {
      LOG.supa("compte.suppression", r.error);
      dire("s-msg", (r.error.code === "PGRST202" || r.error.code === "42883" || r.error.status === 404) ? TR("Cette fonction n'est pas encore activée sur le site.") : TR("Suppression impossible pour le moment. Réessayez."), "err");
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
  /* Remplir avec l'IA : la fonction Supabase « fiche-objet » propose nom, prix, catégorie et description. */
  function versBase64(blob) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).split(",")[1]); };
      fr.onerror = function () { ko(new Error("lecture")); };
      fr.readAsDataURL(blob);
    });
  }
  var MSG_IA = {
    LIMITE: TR("Vous avez atteint le nombre de propositions du jour. Revenez demain ou remplissez à la main."),
    DELAI: TR("Le service met trop de temps à répondre. Réessayez dans un instant ou remplissez à la main."),
    SATURE: TR("Le service est saturé pour le moment. Réessayez dans quelques minutes ou remplissez à la main."),
    ILLISIBLE: TR("Photo pas assez nette, essayez-en une autre."),
    CONFIG: TR("Cette fonction n'est pas encore activée."),
    VENDEUR: TR("Cette fonction est réservée aux vendeurs.")
  };
  $("o-ia").addEventListener("click", async function () {
    var f = fichiers[0]; if (!f) return;
    var b = $("o-ia"); b.disabled = true; dire("o-msg", TR("Analyse de la photo…"));
    try {
      var t0 = Date.now();
      var blob = await reduire(f, 640, 0.75);
      var img64 = await versBase64(blob);
      LOG.debug("ia", "photo envoyée : " + Math.round(blob.size / 1024) + " Ko");
      var ctrl = new AbortController(), minuteur = setTimeout(function () { ctrl.abort(); }, 30000);
      var r;
      try { r = await sb.functions.invoke("fiche-objet", { body: { image: img64 }, signal: ctrl.signal }); }
      finally { clearTimeout(minuteur); }
      LOG.debug("ia", "réponse en " + (Date.now() - t0) + " ms");
      var d = r.data, code = null;
      if (r.error) {
        try { code = (await r.error.context.json()).erreur; } catch (e2) { code = null; }
        throw { code: code, err: r.error };
      }
      if (d && d.erreur) throw { code: d.erreur };
      var pris = [];
      function remplir(id, val) { if (val !== null && val !== undefined && val !== "" && !$(id).value.trim()) { $(id).value = val; pris.push(id); } }
      remplir("o-nom", d.nom); remplir("o-prix", d.prix); remplir("o-cat", d.categorie); remplir("o-desc", d.description);
      LOG.info("ia", "fiche proposée (" + pris.length + " champs)");
      dire("o-msg", pris.length ? TR("Proposition ajoutée : vérifiez et corrigez si besoin.") : TR("Tous les champs sont déjà remplis : rien n'a été modifié."), "ok");
    } catch (e) {
      if (e && (e.name === "AbortError" || (e.err && e.err.name === "AbortError") || /abort/i.test(String(e && e.message)))) e = { code: "DELAI" };
      LOG.warn("ia", e && (e.code || (e.err && e.err.message) || e.message));
      dire("o-msg", (e && MSG_IA[e.code]) || TR("Impossible de proposer une fiche pour le moment. Remplissez à la main."), "err");
    }
    b.disabled = false;
  });
  var fichiers = [];
  /* Choix des photos : plusieurs à la fois, ajoutées au fil des sélections (4 au maximum, la 1re est la principale). */
  var MAX_PHOTOS = 4, MAX_EXTRAS = MAX_PHOTOS - 1;
  function dessinerPhotos() {
    var box = $("o-photos-prev"); box.textContent = "";
    fichiers.forEach(function (f, i) {
      var w = el("span", "mini" + (i === 0 ? " principale" : ""));
      var im = el("img"); im.src = URL.createObjectURL(f); im.alt = TR("Photo {n}", { n: i + 1 }); im.title = i === 0 ? TR("Photo principale") : TR("Mettre en premier");
      im.onclick = function () { if (i > 0) { fichiers.unshift(fichiers.splice(i, 1)[0]); dessinerPhotos(); } };
      w.appendChild(im);
      if (i === 0) w.appendChild(el("span", "mini-tag", TR("Principale")));
      else {
        var st = el("button", "mini-star", TR("\u2605 Principale")); st.type = "button"; st.setAttribute("aria-label", TR("Définir la photo {n} comme photo principale", { n: i + 1 }));
        st.onclick = function () { fichiers.unshift(fichiers.splice(i, 1)[0]); dessinerPhotos(); };
        w.appendChild(st);
      }
      var x = el("button", "mini-x", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", TR("Retirer cette photo"));
      x.onclick = function () { fichiers.splice(i, 1); dessinerPhotos(); };
      w.appendChild(x); box.appendChild(w);
    });
    $("o-photos-aide").hidden = fichiers.length < 2;
    $("o-ia").hidden = !fichiers.length; $("o-ia-note").hidden = !fichiers.length;
  }
  function viderPhotos() { fichiers = []; $("o-photo").value = ""; dessinerPhotos(); }
  $("o-photo").addEventListener("change", function () {
    var choisies = Array.prototype.slice.call($("o-photo").files), trop = false;
    choisies.forEach(function (f) {
      var deja = fichiers.some(function (g) { return g.name === f.name && g.size === f.size && g.lastModified === f.lastModified; });
      if (deja) return;
      if (fichiers.length >= MAX_PHOTOS) { trop = true; return; }
      fichiers.push(f);
    });
    $("o-photo").value = "";
    dire("o-msg", trop ? TR("4 photos au maximum : les suivantes n'ont pas été gardées.") : "");
    dessinerPhotos();
  });

  /* ---------- Objets ---------- */
  var objets = [];
  async function chargerObjets() {
    var r = await sb.from("objets").select("*").eq("vendeur_id", user.id).order("created_at", { ascending: false });
    if (r.error) {
      LOG.supa("objets.liste", r.error);
      var bx = $("l-obj"); bx.textContent = "";
      bx.appendChild(el("p", "empty", TR("Impossible de charger vos objets pour le moment. Rechargez la page.")));
      return;
    }
    objets = (r.data || []).filter(function (o) { return !o.brouillon; });
    LOG.debug("objets", "chargés : " + objets.length);
    var dl = $("cats"); dl.textContent = "";
    objets.map(function (o) { return o.categorie; }).filter(function (c, i, a) { return a.indexOf(c) === i; })
      .forEach(function (c) { var o = el("option"); o.value = c; dl.appendChild(o); });
    var box = $("l-obj"); box.textContent = "";
    if (!objets.length) { box.appendChild(el("p", "empty", TR("Aucun objet pour le moment. Ajoutez le premier ci-dessus."))); return; }
    objets.forEach(function (o) {
      var it = el("div", "it"); it.style.display = "block";
      var top = el("div"); top.style.display = "flex"; top.style.gap = "12px"; top.style.alignItems = "center";
      if (o.photo_url && /^https:\/\//.test(o.photo_url)) {
        var im = el("img"); im.src = o.photo_url; im.alt = ""; im.style.cssText = "width:64px;height:64px;object-fit:cover;border-radius:10px;flex:0 0 auto"; top.appendChild(im);
      }
      var t = el("div"); t.appendChild(el("b", null, o.nom)); t.appendChild(el("div", "meta", prixTxt(o.prix) + " · " + libCat(o.categorie)));
      top.appendChild(t); it.appendChild(top);

      var act = el("div", "rowact");
      var sel = el("select", "etat"); sel.setAttribute("aria-label", TR("État de {nom}", { nom: o.nom }));
      ["Disponible", "Réservé", "Vendu"].forEach(function (s) { var op = el("option", null, window.I18N.lib("etat", s)); op.value = s; if (s === o.etat) op.selected = true; sel.appendChild(op); });
      sel.onchange = async function () {
        var r = await sb.from("objets").update({ etat: sel.value }).eq("id", o.id);
        if (r.error) { LOG.supa("objet.état", r.error); alert(TR("Modification impossible. Réessayez.")); } else { LOG.info("objet", "état → " + sel.value); }
        chargerObjets();
      };
      act.appendChild(sel);

      var pres = o.present_date === today();
      var tg = el("button", "btn btn-line small tog", pres ? TR("Présent aujourd'hui") : TR("Marquer présent aujourd'hui"));
      tg.type = "button"; tg.setAttribute("aria-pressed", pres);
      tg.onclick = async function () {
        var r = await sb.from("objets").update({ present_date: pres ? null : today() }).eq("id", o.id);
        if (r.error) { LOG.supa("objet.présence", r.error); alert(TR("Modification impossible. Réessayez.")); } else { LOG.info("objet", pres ? "présence retirée" : "marqué présent"); }
        chargerObjets();
      };
      act.appendChild(tg);

      var del = el("button", "btn btn-line small", TR("Supprimer")); del.type = "button";
      del.onclick = async function () {
        if (!confirm(TR("Supprimer « {nom} » ?", { nom: o.nom }))) return;
        var chExtras = [];
        try {
          var rx = await sb.from("objet_photos").select("url").eq("objet_id", o.id);
          (rx.data || []).forEach(function (p) { var mm = /\/photos\/(.+)$/.exec(p.url || ""); if (mm) chExtras.push(decodeURIComponent(mm[1])); });
        } catch (e4) {}
        var r = await sb.from("objets").delete().eq("id", o.id);
        if (r.error) { LOG.supa("objet.suppression", r.error); alert(TR("Suppression impossible. Réessayez.")); return; }
        LOG.info("objet", "supprimé");
        if (chExtras.length) { var rme = await sb.storage.from("photos").remove(chExtras); if (rme.error) LOG.supa("photo.suppression", rme.error); }
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
    var btn = $("o-go"); btn.disabled = true; dire("o-msg", TR("Envoi en cours…"));
    try {
      var photo_url = null, f = fichiers[0];
      if (f) {
        LOG.debug("photo choisie", (f.type || "type inconnu") + ", " + Math.round(f.size / 1024) + " Ko");
        var blob = await reduire(f, 1200, 0.82);
        LOG.debug("photo réduite", Math.round(blob.size / 1024) + " Ko");
        var chemin = user.id + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
        var up = await sb.storage.from("photos").upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (up.error) throw up.error;
        photo_url = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
      }
      var extras = fichiers.slice(1, MAX_PHOTOS);
      var r = await sb.from("objets").insert({
        vendeur_id: user.id, nom: $("o-nom").value.trim(), prix: parseFloat($("o-prix").value),
        categorie: $("o-cat").value.trim() || "Divers", description: $("o-desc").value.trim() || null, photo_url: photo_url
      }).select("id").single();
      if (r.error) throw r.error;
      var perdu = false;
      if (extras.length && r.data) {
        try {
          var lignes = [];
          for (var i = 0; i < extras.length; i++) {
            var bl = await reduire(extras[i], 1000, 0.75);
            var ch = user.id + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + i) + ".jpg";
            var u2 = await sb.storage.from("photos").upload(ch, bl, { contentType: "image/jpeg", cacheControl: "31536000" });
            if (u2.error) throw u2.error;
            lignes.push({ objet_id: r.data.id, vendeur_id: user.id, url: sb.storage.from("photos").getPublicUrl(ch).data.publicUrl, position: i + 1 });
          }
          var ri = await sb.from("objet_photos").insert(lignes);
          if (ri.error) throw ri.error;
        } catch (e3) { perdu = true; LOG.supa("objet.galerie", e3); }
      }
      LOG.info("objet", "ajouté" + (photo_url ? " avec photo" : " sans photo"));
      $("f-obj").reset(); viderPhotos();
      dire("o-msg", perdu ? TR("Objet ajouté, mais les photos supplémentaires n'ont pas pu être enregistrées.") : TR("Objet ajouté."), perdu ? "err" : "ok"); chargerObjets();
    } catch (err) { LOG.supa("objet.ajout", err); dire("o-msg", TR("Impossible d'ajouter l'objet. Vérifiez la photo et réessayez."), "err"); }
    btn.disabled = false;
  });


  /* Dictée vocale : un petit micro dans le champ, le texte dicté s'ajoute à la fin. */
  var RecoTexte = window.SpeechRecognition || window.webkitSpeechRecognition;
  function micro(champ) {
    if (!RecoTexte || champ.dataset.micro) return;
    champ.dataset.micro = "1";
    var w = el("div", "champ-micro"); champ.parentNode.insertBefore(w, champ); w.appendChild(champ);
    var b = el("button", "micro", "🎤"); b.type = "button"; b.setAttribute("aria-label", TR("Dicter à voix haute")); b.title = TR("Dicter");
    w.appendChild(b);
    b.addEventListener("click", function () {
      var rec = new RecoTexte(); rec.lang = window.I18N.locale(); rec.interimResults = false;
      b.classList.add("ecoute");
      rec.onresult = function (ev) {
        var t = ev.results[0][0].transcript.trim(); if (!t) return;
        var v = champ.value.trim(); if (estSansTitre(v)) v = "";
        champ.value = v ? v + (/[.!?]$/.test(v) ? " " : " ") + t : t.charAt(0).toUpperCase() + t.slice(1);
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      };
      rec.onerror = function () { b.title = TR("Micro indisponible"); };
      rec.onend = function () { b.classList.remove("ecoute"); };
      try { rec.start(); } catch (e) { b.classList.remove("ecoute"); }
    });
  }
  micro($("o-nom")); micro($("o-desc"));

  /* ---------- Saisie rapide ---------- */
  var MOTS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  /* « deux cinquante » → 2,5 ; « douze euros cinquante » → 12,5 ; « cinq euros » → 5 ; « 2,50 » → 2,5 */
  function prixDepuisTexte(t) {
    t = String(t || "").toLowerCase().replace(/€/g, " euros ").replace(/-/g, " ").replace(/(\d),(\d)/g, "$1.$2");
    var num = t.match(/\d+(\.\d+)?/);
    if (num) {
      var v = parseFloat(num[0]);
      if (/et demi/.test(t)) v += 0.5;
      return v;
    }
    t = t.replace(/quatre vingts?/g, "80").replace(/soixante dix/g, "70").replace(/quatre vingt dix/g, "90");
    var morceaux = t.split(/\s+/).filter(Boolean), nombres = [], cur = null, demi = /et demi/.test(t);
    function clore() { if (cur !== null) { nombres.push(cur); cur = null; } }
    morceaux.forEach(function (m) {
      if (m === "euro" || m === "euros" || m === "virgule") { clore(); return; }
      var v = (m === "80" || m === "70" || m === "90") ? parseInt(m, 10) : MOTS[m];
      if (v === undefined) { if (m !== "et") clore(); return; }
      if (cur === null) { cur = v; return; }
      if (cur >= 20 && cur % 10 === 0 && v < 10 && v > 0) { cur += v; return; }
      if (cur === 10 && v >= 7 && v <= 9) { cur += v; return; }
      if ((cur === 60 || cur === 80 || cur === 70 || cur === 90) && v >= 10 && v < 20) { cur += v; return; }
      clore(); cur = v;
    });
    clore();
    if (!nombres.length) return null;
    var res = nombres[0];
    if (nombres.length > 1 && nombres[1] < 100) res += nombres[1] / 100;
    if (demi) res += 0.5;
    return Math.round(res * 100) / 100;
  }
  window.__prixDepuisTexte = prixDepuisTexte;

  var prixRapide = null, flux = null, file = [], enAttenteIA = 0, faits = 0, iaBloquee = false, actifs = 0;
  function enCours() { return file.length + actifs; }
  function afficherPrixRapide() {
    $("r-prix-etat").textContent = prixRapide === null ? TR("Choisissez un prix : il reste valable pour les photos suivantes.") : TR("Prix en cours : {p} (valable pour les prochaines photos)", { p: prixTxt(prixRapide) });
    Array.prototype.forEach.call($("r-prix").querySelectorAll("[data-p]"), function (b) { b.setAttribute("aria-pressed", String(parseFloat(b.dataset.p) === prixRapide)); b.classList.toggle("choisi", parseFloat(b.dataset.p) === prixRapide); });
    majDeclencheur();
  }
  function peutPhotographier() { return prixRapide !== null || $("r-ia").checked; }
  function majDeclencheur() {
    $("r-declencher").disabled = !peutPhotographier();
    $("r-declencher").title = peutPhotographier() ? TR("Prendre la photo") : TR("Choisissez d'abord un prix");
  }
  $("r-prix").addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]"); if (!b) return;
    prixRapide = parseFloat(b.dataset.p); $("r-autre").value = ""; afficherPrixRapide();
  });
  $("r-autre").addEventListener("input", function () {
    var v = parseFloat($("r-autre").value.replace(",", "."));
    prixRapide = isFinite(v) && v >= 0 ? v : null; afficherPrixRapide();
  });
  $("r-ia").addEventListener("change", function () { $("r-ia-note").hidden = !$("r-ia").checked; majDeclencheur(); });

  /* Prix à la voix (si le navigateur sait écouter) */
  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Reco) {
    $("r-voix").hidden = false;
    $("r-voix").addEventListener("click", function () {
      var rec = new Reco(); rec.lang = window.I18N.locale(); rec.interimResults = false; rec.maxAlternatives = 3;
      $("r-voix").textContent = TR("🎤 J'écoute…");
      rec.onresult = function (ev) {
        var p = null;
        for (var i = 0; i < ev.results[0].length && p === null; i++) p = prixDepuisTexte(ev.results[0][i].transcript);
        if (p === null || !isFinite(p) || p > 5000) { dire("r-msg", TR("Je n'ai pas compris le prix (« {t} »). Réessayez ou touchez un prix.", { t: ev.results[0][0].transcript }), "err"); return; }
        prixRapide = p; $("r-autre").value = p; dire("r-msg", ""); afficherPrixRapide();
      };
      rec.onerror = function () { dire("r-msg", TR("Micro indisponible : touchez un prix."), "err"); };
      rec.onend = function () { $("r-voix").textContent = TR("🎤 Dire le prix"); };
      try { rec.start(); } catch (e) { $("r-voix").textContent = TR("🎤 Dire le prix"); }
    });
  }

  /* Appareil photo qui reste ouvert */
  function arreterCamera() {
    if (flux) { flux.getTracks().forEach(function (t) { t.stop(); }); flux = null; }
    $("r-cam").hidden = true; $("r-fermer").hidden = true; $("r-ouvrir").hidden = false;
  }
  $("r-ouvrir").addEventListener("click", async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("r-capture").click(); return; }
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } }, audio: false });
      $("r-video").srcObject = flux; $("r-cam").hidden = false; $("r-fermer").hidden = false; $("r-ouvrir").hidden = true; dire("r-msg", "");
      majDeclencheur();
    } catch (err) {
      LOG.warn("caméra", err && err.name);
      dire("r-msg", TR("Impossible d'ouvrir la caméra (autorisation refusée ?). Vous pouvez importer des photos à la place."), "err");
      $("r-capture").click();
    }
  });
  $("r-fermer").addEventListener("click", arreterCamera);
  $("r-declencher").addEventListener("click", function () {
    var v = $("r-video"); if (!flux || !v.videoWidth || !peutPhotographier()) return;
    var c = document.createElement("canvas"), r = Math.min(1, 1200 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * r); c.height = Math.round(v.videoHeight * r);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    $("r-cam").classList.add("flash"); setTimeout(function () { $("r-cam").classList.remove("flash"); }, 120);
    if (navigator.vibrate) navigator.vibrate(30);
    c.toBlob(function (b) { if (b) ajouterALaFile(b); }, "image/jpeg", 0.82);
  });
  $("r-capture").addEventListener("change", function () { Array.prototype.forEach.call($("r-capture").files, function (f) { ajouterALaFile(f); }); $("r-capture").value = ""; });
  $("r-import").addEventListener("change", function () {
    var fs = Array.prototype.slice.call($("r-import").files); $("r-import").value = "";
    if (!fs.length) return;
    if (!peutPhotographier()) { dire("r-msg", TR("Choisissez d'abord un prix (valable pour toutes les photos importées), ou activez l'IA."), "err"); return; }
    fs.forEach(function (f) { ajouterALaFile(f); });
  });

  /* File d'attente : photo envoyée, fiche remplie (IA facultative), brouillon créé */
  function ajouterALaFile(blob) {
    file.push({ blob: blob, prix: prixRapide, ia: $("r-ia").checked, url: URL.createObjectURL(blob), etat: "attente" });
    dessinerFile(); pomper();
  }
  function dessinerFile() {
    var box = $("r-file"); box.textContent = "";
    file.forEach(function (it) {
      var c = el("div", "rap-carte" + (it.etat === "envoi" ? " en-cours" : ""));
      var im = el("img"); im.src = it.url; im.alt = ""; c.appendChild(im);
      c.appendChild(el("span", null, (it.prix !== null ? prixTxt(it.prix) + " · " : "") + (it.etat === "envoi" ? (it.ia ? TR("analyse…") : TR("envoi…")) : TR("en attente"))));
      if (it.etat === "attente") {
        var x = el("button", "rap-x", "×"); x.type = "button"; x.setAttribute("aria-label", TR("Annuler cette photo"));
        x.onclick = function () { file = file.filter(function (z) { return z !== it; }); URL.revokeObjectURL(it.url); dessinerFile(); };
        c.appendChild(x);
      }
      box.appendChild(c);
    });
    $("r-compteur").textContent = faits + (faits > 1 ? " objets" : " objet") + (enCours() ? " · " + enCours() + " en cours" : "");
  }
  function pomper() {
    while (actifs < 2) {
      var it = file.find(function (x) { return x.etat === "attente"; });
      if (!it) break;
      it.etat = "envoi"; actifs++;
      traiter(it).then(function () { return null; }, function (e) { LOG.supa("rapide", e); }).then(function () {
        actifs--; file = file.filter(function (x) { return x !== it; }); dessinerFile(); pomper();
        if (!enCours()) chargerBrouillons();
      });
    }
    dessinerFile();
  }
  async function traiter(it) {
    var petit = await reduire(it.blob, 1200, 0.82);
    var chemin = user.id + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
    var up = await sb.storage.from("photos").upload(chemin, petit, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (up.error) throw up.error;
    var photo_url = sb.storage.from("photos").getPublicUrl(chemin).data.publicUrl;
    var fiche = { nom: TR("Objet sans titre"), categorie: "Divers", description: null, prix: it.prix };
    if (it.ia && !iaBloquee) {
      try {
        var img64 = await versBase64(await reduire(it.blob, 640, 0.75));
        var r = await sb.functions.invoke("fiche-objet", { body: { image: img64 } });
        var code = null;
        if (r.error) { try { code = (await r.error.context.json()).erreur; } catch (e2) { code = null; } throw { code: code }; }
        if (r.data && !r.data.erreur) {
          fiche.nom = r.data.nom || fiche.nom; fiche.categorie = r.data.categorie || "Divers"; fiche.description = r.data.description || null;
          if (fiche.prix === null && r.data.prix !== null && r.data.prix !== undefined) fiche.prix = r.data.prix;
        }
      } catch (e) {
        if (e && e.code === "LIMITE") { iaBloquee = true; dire("r-msg", TR("Plafond d'IA du jour atteint : les prochaines photos sont enregistrées sans IA."), "err"); }
        else LOG.warn("rapide.ia", e && (e.code || e.message));
      }
    }
    var ins = await sb.from("objets").insert({
      vendeur_id: user.id, nom: fiche.nom, prix: fiche.prix === null ? 0 : fiche.prix, categorie: fiche.categorie, description: fiche.description,
      photo_url: photo_url, brouillon: true
    });
    if (ins.error) {
      if (colonneAbsente(ins.error)) dire("r-msg", TR("La mise à jour de la base (brouillons) n'a pas encore été faite : voir les instructions."), "err");
      throw ins.error;
    }
    faits++;
  }

  /* À vérifier : brouillons à relire puis valider */
  async function chargerBrouillons() {
    var r = await sb.from("objets").select("*").eq("vendeur_id", user.id).eq("brouillon", true).order("created_at", { ascending: false });
    var box = $("r-brouillons"); box.textContent = "";
    if (r.error) { LOG.supa("brouillons.liste", r.error); $("r-tout").hidden = true; box.appendChild(el("p", "empty", colonneAbsente(r.error) ? TR("Fonction non activée : la mise à jour de la base reste à faire.") : TR("Impossible de charger les brouillons pour le moment."))); return; }
    var l = r.data || [];
    $("r-tout").hidden = !l.length; $("r-tout").textContent = TR("Tout valider ({n})", { n: l.length });
    if (!l.length) { box.appendChild(el("p", "empty", TR("Aucun objet à vérifier."))); return; }
    var cats = {}; (objets || []).forEach(function (o) { if (o.categorie) cats[o.categorie] = 1; }); ["Meubles", "Vaisselle", "Déco", "Luminaires", "Jouets", "Livres", "Vêtements", "Bijoux", "Outils", "Électroménager", "Disques", "Divers"].forEach(function (c) { cats[c] = 1; });
    var dl = $("cats"); dl.textContent = ""; Object.keys(cats).forEach(function (c) { var o = el("option"); o.value = c; dl.appendChild(o); });
    l.forEach(function (o) {
      var it = el("div", "rap-brouillon"); it.dataset.id = o.id;
      var im = el("img"); im.src = o.photo_url || ""; im.alt = ""; it.appendChild(im);
      var f = el("div", "rap-champs");
      var nom = el("input"); nom.value = o.nom; nom.maxLength = 120; nom.setAttribute("aria-label", TR("Nom"));
      var desc = el("textarea"); desc.value = o.description || ""; desc.maxLength = 500; desc.rows = 2; desc.placeholder = TR("Description (facultatif)"); desc.setAttribute("aria-label", TR("Description"));
      var ligne = el("div", "rap-ligne2");
      var prix = el("input"); prix.type = "number"; prix.min = "0"; prix.step = "0.5"; prix.inputMode = "decimal"; prix.value = o.prix; prix.setAttribute("aria-label", TR("Prix en euros"));
      var cat = el("input"); cat.value = o.categorie; cat.maxLength = 40; cat.setAttribute("list", "cats"); cat.setAttribute("aria-label", TR("Catégorie"));
      ligne.appendChild(prix); ligne.appendChild(cat);
      var act = el("div", "rowact");
      var ok = el("button", "btn btn-gold small", TR("Valider")); ok.type = "button";
      var no = el("button", "btn btn-line small", TR("Supprimer")); no.type = "button";
      ok.onclick = function () { return valider(o, nom, prix, cat, it, desc); };
      no.onclick = async function () {
        if (!confirm(TR("Supprimer ce brouillon ?"))) return;
        var d = await sb.from("objets").delete().eq("id", o.id);
        if (d.error) { LOG.supa("brouillon.suppression", d.error); dire("r-msg2", TR("Suppression impossible. Réessayez."), "err"); return; }
        var m = /\/photos\/(.+)$/.exec(o.photo_url || ""); if (m) sb.storage.from("photos").remove([decodeURIComponent(m[1])]);
        chargerBrouillons();
      };
      act.appendChild(ok); act.appendChild(no);
      f.appendChild(nom); f.appendChild(ligne); f.appendChild(desc); f.appendChild(act); it.appendChild(f); micro(nom); micro(desc);
      it._lire = function () { return { id: o.id, nom: nom.value.trim(), prix: parseFloat(prix.value), categorie: cat.value.trim() || "Divers", description: desc.value.trim() || null }; };
      box.appendChild(it);
    });
  }
  async function valider(o, nom, prix, cat, ligne, desc) {
    var n = nom.value.trim(), p = parseFloat(prix.value);
    if (!n || !isFinite(p) || p < 0) { dire("r-msg2", TR("Indiquez un nom et un prix avant de valider."), "err"); return false; }
    var r = await sb.from("objets").update({ nom: n, prix: p, categorie: cat.value.trim() || "Divers", description: desc.value.trim() || null, brouillon: false }).eq("id", o.id);
    if (r.error) { LOG.supa("brouillon.validation", r.error); dire("r-msg2", TR("Validation impossible. Réessayez."), "err"); return false; }
    LOG.info("objet", "brouillon validé");
    ligne.remove(); dire("r-msg2", TR("Objet validé : il est maintenant visible."), "ok"); chargerObjets();
    if (!$("r-brouillons").querySelector(".rap-brouillon")) chargerBrouillons();
    return true;
  }
  $("r-tout").addEventListener("click", async function () {
    var lignes = Array.prototype.slice.call($("r-brouillons").querySelectorAll(".rap-brouillon")), ok = 0, ignores = 0;
    $("r-tout").disabled = true;
    for (var i = 0; i < lignes.length; i++) {
      var d = lignes[i]._lire();
      if (!d.nom || estSansTitre(d.nom) || !isFinite(d.prix) || d.prix <= 0) { ignores++; continue; }
      var r = await sb.from("objets").update({ nom: d.nom, prix: d.prix, categorie: d.categorie, description: d.description, brouillon: false }).eq("id", d.id);
      if (r.error) { LOG.supa("brouillon.validation", r.error); ignores++; } else ok++;
    }
    $("r-tout").disabled = false;
    dire("r-msg2", TN("valide", ok) + (ignores ? " " + TR("{n} à compléter (nom ou prix manquant).", { n: ignores }) : ""), ignores ? "err" : "ok");
    chargerObjets(); chargerBrouillons();
  });
  window.addEventListener("beforeunload", function () { if (flux) arreterCamera(); });
  if (window.Aide) window.Aide.brancher(sb, function () { return user ? user.id : null; });
  afficherPrixRapide();


  /* ---------- Mon affichage : fiche A6 avec QR code ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function qrSvg(texte) {
    var q = window.QRMatrice(texte, "M"), marge = 2, t = q.n + 2 * marge;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + t + " " + t); svg.setAttribute("shape-rendering", "crispEdges"); svg.setAttribute("aria-hidden", "true");
    var fond = document.createElementNS(SVGNS, "rect"); fond.setAttribute("width", t); fond.setAttribute("height", t); fond.setAttribute("fill", "#fff"); svg.appendChild(fond);
    var d = "";
    for (var r = 0; r < q.n; r++) for (var c = 0; c < q.n; c++) if (q.m[r][c]) d += "M" + (c + marge) + " " + (r + marge) + "h1v1h-1z";
    var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); p.setAttribute("fill", "#000"); svg.appendChild(p);
    return svg;
  }
  function phraseAffichage() { return $("fq-phrase").value.trim() || TR("Scannez pour voir mes trouvailles"); }
  function dessinerAffichage() {
    if (!vendeur || !window.QRMatrice) return;
    var lien = lienPublic();
    $("fq-nom").textContent = vendeur.nom;
    $("fq-texte").textContent = phraseAffichage();
    var box = $("fq-qr"); box.textContent = ""; box.appendChild(qrSvg(lien)); box.setAttribute("aria-label", TR("QR code de votre boutique"));
    $("fq-lieu").hidden = !vendeur.lieu; $("fq-lieu").textContent = vendeur.lieu || "";
    $("fq-url").textContent = lien.replace(/^https?:\/\//, "");
  }
  $("fq-phrase").addEventListener("input", function () { $("fq-texte").textContent = phraseAffichage(); });
  /* Impression : la fiche est mise seule dans un cadre invisible, au format A6, puis imprimée. */
  window.__htmlFiche = null;
  $("fq-imprimer").addEventListener("click", function () {
    if (!vendeur || !window.QRMatrice) return;
    var f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title>' + TR("Mon affichage") + '</title><style>' +
      '@page{size:105mm 148mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}' +
      'body{width:105mm;height:148mm;background:#FFF8DC;color:#1D2A2E;font-family:Arial,Helvetica,sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.h{align-self:stretch;height:8mm;background:#F7CB52;margin-bottom:8mm}' +
      'h1{font:700 22pt/1.15 Georgia,serif;margin:0 8mm 3mm;overflow-wrap:anywhere}' +
      '.p{font-weight:700;font-size:13pt;color:#0F4C5C;margin:0 8mm 5mm}' +
      '.q{width:66mm;background:#fff;line-height:0}.q svg{width:100%;height:auto;display:block}' +
      '.l{font-weight:700;font-size:12pt;margin:4mm 8mm 0}' +
      '.u{margin:auto 8mm 7mm;font-size:8pt;color:#6B6040;overflow-wrap:anywhere}' +
      '</style></head><body></body></html>';
    f.onload = function () {
      var d = f.contentDocument, b = d.body;
      function ajoute(tag, cls, txt) { var n = d.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; b.appendChild(n); return n; }
      ajoute("div", "h"); ajoute("h1", "", vendeur.nom); ajoute("p", "p", phraseAffichage());
      var q = ajoute("div", "q"); q.appendChild(d.importNode(qrSvg(lienPublic()), true));
      if (vendeur.lieu) ajoute("p", "l", vendeur.lieu);
      ajoute("p", "u", lienPublic().replace(/^https?:\/\//, ""));
      window.__htmlFiche = d.documentElement.outerHTML;
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (err) { LOG.warn("impression", err && err.message); dire("fq-msg", TR("Impression impossible : utilisez « Télécharger l'image »."), "err"); }
        setTimeout(function () { f.remove(); }, 3000);
      }, 250);
    };
    document.body.appendChild(f);
  });
  function lignesTexte(ctx, texte, largeur) {
    var mots = String(texte).split(/\s+/), lignes = [], cur = "";
    mots.forEach(function (m) { var essai = cur ? cur + " " + m : m; if (ctx.measureText(essai).width > largeur && cur) { lignes.push(cur); cur = m; } else cur = essai; });
    if (cur) lignes.push(cur);
    return lignes;
  }
  $("fq-png").addEventListener("click", function () {
    if (!vendeur || !window.QRMatrice) return;
    var W = 1240, H = 1748, c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.fillStyle = "#FFF8DC"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#F7CB52"; x.fillRect(0, 0, W, 150);
    x.textAlign = "center"; x.fillStyle = "#1D2A2E";
    x.font = "700 110px 'Young Serif', Georgia, serif";
    var y = 330; lignesTexte(x, vendeur.nom, W - 200).forEach(function (l) { x.fillText(l, W / 2, y); y += 125; });
    x.font = "700 62px 'Nunito Sans', Arial, sans-serif"; x.fillStyle = "#0F4C5C";
    y += 10; lignesTexte(x, phraseAffichage(), W - 240).forEach(function (l) { x.fillText(l, W / 2, y); y += 78; });
    var q = window.QRMatrice(lienPublic(), "M"), marge = 2, cases = q.n + 2 * marge, taille = 860, px = Math.floor(taille / cases), tot = px * cases;
    var ox = Math.round((W - tot) / 2), oy = Math.max(y + 30, 700);
    x.fillStyle = "#fff"; x.fillRect(ox - 20, oy - 20, tot + 40, tot + 40);
    x.fillStyle = "#000";
    for (var r = 0; r < q.n; r++) for (var k = 0; k < q.n; k++) if (q.m[r][k]) x.fillRect(ox + (k + marge) * px, oy + (r + marge) * px, px, px);
    var bas = oy + tot + 90;
    x.fillStyle = "#1D2A2E";
    if (vendeur.lieu) { x.font = "700 54px 'Nunito Sans', Arial, sans-serif"; x.fillText(vendeur.lieu, W / 2, bas); bas += 70; }
    x.font = "400 40px 'Nunito Sans', Arial, sans-serif"; x.fillStyle = "#6B6040"; x.fillText(lienPublic().replace(/^https?:\/\//, ""), W / 2, bas);
    c.toBlob(function (b) {
      if (!b) { dire("fq-msg", TR("Impossible de créer l'image. Réessayez."), "err"); return; }
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "affichage-" + (vendeur.slug || "boutique") + ".png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      dire("fq-msg", TR("Image téléchargée."), "ok");
    }, "image/png");
  });

  /* ---------- Marchés ---------- */
  async function chargerMarches() {
    var r = await sb.from("marches").select("*").eq("vendeur_id", user.id).gte("date", today()).order("date");
    var box = $("l-mar"); box.textContent = "";
    if (r.error) {
      LOG.supa("marchés.liste", r.error);
      box.appendChild(el("p", "empty", TR("Impossible de charger vos marchés pour le moment. Rechargez la page.")));
      return;
    }
    var l = r.data || [];
    LOG.debug("marchés", "chargés : " + l.length);
    if (!l.length) { box.appendChild(el("p", "empty", TR("Aucun marché à venir."))); return; }
    l.forEach(function (m) {
      var it = el("div", "it");
      var t = el("div"); t.appendChild(el("b", null, m.nom));
      t.appendChild(el("div", "meta", [dateFr(m.date), m.heures, m.lieu].filter(Boolean).join(" · ")));
      it.appendChild(t);
      var del = el("button", "btn btn-line small", TR("Retirer")); del.type = "button";
      del.onclick = async function () {
        var d = await sb.from("marches").delete().eq("id", m.id);
        if (d.error) { LOG.supa("marché.suppression", d.error); alert(TR("Suppression impossible. Réessayez.")); } else { LOG.info("marché", "retiré"); }
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
    if (r.error) { LOG.supa("marché.ajout", r.error); dire("m-msg", TR("Impossible d'ajouter ce marché. Vérifiez les champs."), "err"); return; }
    LOG.info("marché", "ajouté");
    $("f-mar").reset(); dire("m-msg", TR("Marché ajouté."), "ok"); chargerMarches();
  });

  /* ---------- Démarrage ---------- */
  async function aiguiller() {
    if (!user) { vendeur = null; vue("auth"); return; }
    var r = await sb.from("vendeurs").select("*").eq("id", user.id).maybeSingle();
    if (r.error) { LOG.supa("boutique.lecture", r.error); vue("auth"); dire("a-msg", TR("Connexion impossible pour le moment."), "err"); return; }
    if (!r.data) {
      if (estVisiteur(user) ? (versSite || visiteurParam) : (visiteurParam && versSite)) {
        /* Simple visiteur (sans boutique) : retour sur la boutique qu'il regardait. */
        versSite = false;
        location.href = location.pathname.replace(/espace\.html$/, "") + retourParam;
        return;
      }
      versSite = false; vue("creer"); return;
    }
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
    if (session) window.I18N.synchroniser(sb, session);
    var change = (u && u.id) !== (user && user.id);
    user = u;
    if (u && u.email) $("n-user").value = u.email;
    if (evt === "PASSWORD_RECOVERY") { recovering = true; setTimeout(function () { vue("nouveau"); }, 0); return; }
    if (change && !recovering) setTimeout(aiguiller, 0);
  });
  sb.auth.getSession().then(function (r) {
    if (r.error) LOG.supa("session", r.error);
    var u = r.data && r.data.session ? r.data.session.user : null;
    if (r.data && r.data.session) window.I18N.synchroniser(sb, r.data.session);
    if (recovering) { vue("nouveau"); }
    else if (lienExpire) { vue("auth"); dire("a-msg", TR("Ce lien a expiré. Demandez-en un nouveau avec « Mot de passe oublié ? »."), "err"); }
    else if (!user && !u) { vue("auth"); }
  }).catch(function (e) { LOG.error("session", e); vue("auth"); });
})();
