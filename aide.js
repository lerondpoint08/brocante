/* « Aide et suggestions » : une petite fenêtre pour écrire au responsable du site.
   Utilisation : window.Aide.brancher(sb, function () { return userId; }) puis un lien/bouton #aide-lien. */
(function () {
  var I = window.I18N; if (!I) return;
  I.ajouter("fr", {
    "aide.lien": "Aide et suggestions",
    "aide.titre": "Aide et suggestions",
    "aide.intro": "Une question, un souci, une idée pour améliorer le site ? Écrivez-nous, on lit tout.",
    "aide.type": "Votre message est…",
    "aide.type.aide": "Une demande d'aide",
    "aide.type.suggestion": "Une suggestion",
    "aide.message": "Votre message",
    "aide.contact": "Comment vous répondre ? (facultatif : e-mail ou téléphone)",
    "aide.envoyer": "Envoyer",
    "aide.fermer": "Fermer",
    "aide.court": "Écrivez au moins quelques mots (5 caractères).",
    "aide.merci": "Merci ! Votre message est bien reçu.",
    "aide.echec": "Envoi impossible pour le moment. Réessayez plus tard."
  });
  I.ajouter("en", {
    "aide.lien": "Help and suggestions",
    "aide.titre": "Help and suggestions",
    "aide.intro": "A question, a problem, an idea to improve the site? Write to us, we read everything.",
    "aide.type": "Your message is…",
    "aide.type.aide": "A request for help",
    "aide.type.suggestion": "A suggestion",
    "aide.message": "Your message",
    "aide.contact": "How can we reply? (optional: email or phone)",
    "aide.envoyer": "Send",
    "aide.fermer": "Close",
    "aide.court": "Please write at least a few words (5 characters).",
    "aide.merci": "Thank you! Your message has been received.",
    "aide.echec": "Unable to send right now. Please try again later."
  });
  var T = I.t, ov = null;
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function fermer() { if (ov) { ov.remove(); ov = null; } }
  function ouvrir(sb, getUser) {
    fermer();
    ov = el("div", "overlay zoom"); ov.addEventListener("click", function (e) { if (e.target === ov) fermer(); });
    var box = el("form", "card modale porte form"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", T("aide.titre"));
    box.appendChild(el("h3", null, T("aide.titre")));
    box.appendChild(el("p", "meta", T("aide.intro")));
    var gt = el("div", "aide-type"); gt.setAttribute("role", "group"); gt.setAttribute("aria-label", T("aide.type"));
    var type = "aide";
    [["aide", T("aide.type.aide")], ["suggestion", T("aide.type.suggestion")]].forEach(function (x) {
      var b = el("button", "chip", x[1]); b.type = "button"; b.setAttribute("aria-pressed", String(x[0] === type));
      b.addEventListener("click", function () { type = x[0]; Array.prototype.forEach.call(gt.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); }); });
      gt.appendChild(b);
    });
    box.appendChild(gt);
    var l1 = el("label", null, T("aide.message")), msg = el("textarea"); msg.maxLength = 1000; msg.required = true; msg.rows = 5; l1.appendChild(msg); box.appendChild(l1);
    var l2 = el("label", null, T("aide.contact")), ct = el("input"); ct.type = "text"; ct.maxLength = 120; ct.autocomplete = "off"; l2.appendChild(ct); box.appendChild(l2);
    var etat = el("p", "msg"); etat.setAttribute("role", "status");
    var ok = el("button", "btn btn-gold", T("aide.envoyer")); ok.type = "submit";
    var f = el("button", "btn btn-line small", T("aide.fermer")); f.type = "button"; f.addEventListener("click", fermer);
    box.appendChild(ok); box.appendChild(etat); box.appendChild(f);
    box.addEventListener("submit", async function (e) {
      e.preventDefault();
      var m = msg.value.trim();
      if (m.length < 5) { etat.className = "msg err"; etat.textContent = T("aide.court"); return; }
      ok.disabled = true; etat.className = "msg"; etat.textContent = "";
      var uid = getUser ? getUser() : null;
      var ligne = { type: type, message: m, contact: ct.value.trim() || null, page: (location.pathname + location.search).slice(0, 200), langue: I.lang() };
      if (uid) ligne.user_id = uid;
      var r = sb ? await sb.from("demandes_aide").insert(ligne) : { error: true };
      ok.disabled = false;
      if (r.error) { if (window.LOG) window.LOG.supa("aide.envoi", r.error); etat.className = "msg err"; etat.textContent = T("aide.echec"); return; }
      msg.value = ""; ct.value = ""; etat.className = "msg ok"; etat.textContent = T("aide.merci");
    });
    ov.appendChild(box); document.body.appendChild(ov); msg.focus();
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fermer(); });
  window.Aide = {
    brancher: function (sb, getUser) {
      I.appliquer();
      Array.prototype.forEach.call(document.querySelectorAll("[data-aide]"), function (a) {
        a.addEventListener("click", function (e) { e.preventDefault(); ouvrir(sb, getUser); });
      });
    }
  };
})();
