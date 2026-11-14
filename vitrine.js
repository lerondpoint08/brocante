/* « Ma vitrine » : page décorée façon tableau d'affichage (blocs, notes, stickers, fond).
   Le même code dessine la vitrine côté visiteurs (app-public.js) et dans l'éditeur (app-espace.js).
   Sur grand écran, les éléments sont posés librement sur une toile de 1000 px mise à l'échelle ;
   sur téléphone, ils sont empilés dans l'ordre choisi, avec les stickers accrochés au bloc le plus proche. */
(function () {
  "use strict";
  var LARGEUR = 1000, SEUIL = 720;
  var T = function (k, p) { return window.I18N ? window.I18N.t(k, p) : k; };

  var FONDS = ["vichy", "bois", "pois", "jute"];
  var STICKERS = {
    fleur: "🌼", noeud: "🎀", etoile: "⭐", coeur: "💛", panier: "🧺", tasse: "☕", bougie: "🕯️", fleche: "➡️",
    "piece-unique": { k: "vit.st.unique", c: "v-tampon" }, "coup-de-coeur": { k: "vit.st.coeur", c: "v-tampon" },
    "petit-prix": { k: "vit.st.prix", c: "v-etiq" }, "nouveau": { k: "vit.st.nouveau", c: "v-etiq" }
  };
  var BLOCS = {
    accueil: { k: "vit.b.accueil", w: 440 },
    coeurs: { k: "vit.b.coeurs", w: 520 },
    marche: { k: "vit.b.marche", w: 300 },
    photo: { k: "vit.b.photo", w: 280 },
    livre: { k: "vit.b.livre", w: 480 }
  };
  var NOTES = ["jaune", "rose", "vert", "bleu"];
  var LARG_NOTE = 210;

  function id() { return Math.random().toString(36).slice(2, 9); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function largeur(e) { return e.t === "bloc" ? (BLOCS[e.b] || { w: 300 }).w : e.t === "note" ? LARG_NOTE : 120; }

  function defaut(vendeur) {
    return {
      v: 1, fond: "vichy", coeurs: [], photo: null, legende: "",
      accueil: (vendeur && vendeur.presentation) || "",
      elements: [
        { id: id(), t: "bloc", b: "accueil", x: 30, y: 30, r: 0, o: 1 },
        { id: id(), t: "note", texte: T("vit.note.defaut"), c: "jaune", x: 520, y: 36, r: 4, o: 2 },
        { id: id(), t: "bloc", b: "coeurs", x: 30, y: 260, r: 0, o: 3 },
        { id: id(), t: "bloc", b: "marche", x: 610, y: 300, r: -1, o: 4 },
        { id: id(), t: "bloc", b: "livre", x: 30, y: 590, r: 0, o: 5 },
        { id: id(), t: "sticker", s: "piece-unique", x: 450, y: 240, r: 10 },
        { id: id(), t: "sticker", s: "fleur", x: 880, y: 280, r: 0 }
      ]
    };
  }
  /* Nettoie des données venues de la base : on ne garde que ce qu'on sait dessiner. */
  function propre(v) {
    if (!v || typeof v !== "object" || !Array.isArray(v.elements)) return null;
    var n = function (x, a, b) { x = Number(x); return isFinite(x) ? Math.max(a, Math.min(b, Math.round(x))) : a; };
    var els = v.elements.filter(function (e) {
      return e && (e.t === "bloc" && BLOCS[e.b] || e.t === "note" || e.t === "sticker" && STICKERS[e.s]);
    }).slice(0, 40).map(function (e) {
      var o = { id: String(e.id || id()).slice(0, 12), t: e.t, x: n(e.x, 0, LARGEUR - 40), y: n(e.y, 0, 4000), r: n(e.r, -20, 20), o: n(e.o, 0, 999) };
      if (e.t === "bloc") o.b = e.b;
      if (e.t === "note") { o.texte = String(e.texte || "").slice(0, 140); o.c = NOTES.indexOf(e.c) >= 0 ? e.c : "jaune"; }
      if (e.t === "sticker") { o.s = e.s; if (e.ancre) o.ancre = String(e.ancre).slice(0, 12); }
      return o;
    });
    var vu = {};
    els = els.filter(function (e) { if (e.t !== "bloc") return true; if (vu[e.b]) return false; vu[e.b] = 1; return true; });
    return {
      v: 1, fond: FONDS.indexOf(v.fond) >= 0 ? v.fond : "vichy", elements: els,
      coeurs: (Array.isArray(v.coeurs) ? v.coeurs : []).map(String).slice(0, 3),
      photo: typeof v.photo === "string" && /^https:\/\//.test(v.photo) ? v.photo : null,
      legende: String(v.legende || "").slice(0, 60),
      accueil: String(v.accueil || "").slice(0, 400)
    };
  }
  /* Chaque sticker est rattaché au bloc ou à la note la plus proche (pour l'affichage empilé). */
  function ancrer(v) {
    var hotes = v.elements.filter(function (e) { return e.t !== "sticker"; });
    v.elements.forEach(function (s) {
      if (s.t !== "sticker") return;
      var best = null, bd = Infinity;
      hotes.forEach(function (h) {
        var cx = h.x + largeur(h) / 2, cy = h.y + 80, d = Math.hypot(cx - s.x, cy - s.y);
        if (d < bd) { bd = d; best = h; }
      });
      if (best) s.ancre = best.id; else delete s.ancre;
    });
    return v;
  }

  /* ---------- Contenu des blocs ---------- */
  function blocContenu(e, v, ctx) {
    var ed = ctx.edition, box = el("div", "v-contenu");
    box.appendChild(el("h3", null, T(BLOCS[e.b].k)));
    if (e.b === "accueil") {
      if (ed) {
        var ta = el("textarea", "v-champ"); ta.maxLength = 400; ta.rows = 4; ta.value = v.accueil; ta.placeholder = T("vit.accueil.ph");
        ta.oninput = function () { v.accueil = ta.value; ctx.change(); }; box.appendChild(ta);
      } else {
        if (!v.accueil.trim()) return null;
        box.appendChild(el("p", "v-texte", v.accueil));
      }
    } else if (e.b === "coeurs") {
      var objs = v.coeurs.map(function (i) { return (ctx.objets || []).filter(function (o) { return String(o.id) === i && o.etat !== "Vendu"; })[0]; }).filter(Boolean);
      if (!objs.length && !ed) return null;
      var g = el("div", "v-coeurs");
      objs.forEach(function (o) {
        var c = el(ctx.ouvrirObjet ? "button" : "div", "v-obj");
        if (ctx.ouvrirObjet) { c.type = "button"; c.onclick = function () { ctx.ouvrirObjet(o.id); }; }
        var ph = el("div", "v-obj-ph");
        if (o.photo_url && /^https:\/\//.test(o.photo_url)) { var im = el("img"); im.src = o.photo_url; im.alt = ""; im.loading = "lazy"; ph.appendChild(im); }
        c.appendChild(ph);
        var t = el("div", "v-obj-tx"); t.appendChild(el("span", "v-obj-nom", o.nom));
        if (o.prix != null) t.appendChild(el("span", "v-obj-prix", ctx.prix ? ctx.prix(o.prix) : o.prix + " €"));
        c.appendChild(t); g.appendChild(c);
      });
      box.appendChild(g);
      if (ed) {
        var choix = el("div", "v-choix");
        [0, 1, 2].forEach(function (k) {
          var s = el("select", "v-champ"); s.setAttribute("aria-label", T("vit.coeur.n", { n: k + 1 }));
          var o0 = el("option", null, T("vit.coeur.aucun")); o0.value = ""; s.appendChild(o0);
          (ctx.objets || []).filter(function (o) { return o.etat !== "Vendu"; }).forEach(function (o) {
            var op = el("option", null, o.nom); op.value = String(o.id); s.appendChild(op);
          });
          s.value = v.coeurs[k] || "";
          s.onchange = function () {
            var l = [0, 1, 2].map(function (j) { return j === k ? s.value : (v.coeurs[j] || ""); }).filter(Boolean);
            v.coeurs = l.filter(function (x, i) { return l.indexOf(x) === i; }); ctx.change(true);
          };
          choix.appendChild(s);
        });
        box.appendChild(choix);
      }
    } else if (e.b === "marche") {
      var m = ctx.marche;
      if (!m && !ed) return null;
      if (!m) { box.appendChild(el("p", "v-vide", T("vit.marche.aucun"))); return box; }
      var p = String(m.date).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
      var r = el("div", "v-marche");
      var cal = el("div", "v-cal"); cal.appendChild(el("span", "v-cal-j", String(d.getDate())));
      cal.appendChild(el("small", null, d.toLocaleDateString(ctx.locale || "fr-FR", { month: "short" }))); r.appendChild(cal);
      var tx = el("div"); tx.appendChild(el("b", null, m.nom));
      if (m.lieu) tx.appendChild(el("div", null, m.lieu));
      tx.appendChild(el("div", null, d.toLocaleDateString(ctx.locale || "fr-FR", { weekday: "long", day: "numeric", month: "long" }) + (m.heures ? " · " + m.heures : "")));
      r.appendChild(tx); box.appendChild(r);
    } else if (e.b === "photo") {
      if (!v.photo && !ed) return null;
      box.classList.add("v-polaroid");
      box.removeChild(box.firstChild);
      if (v.photo) { var im2 = el("img"); im2.src = v.photo; im2.alt = v.legende || T("vit.b.photo"); box.appendChild(im2); }
      else box.appendChild(el("div", "v-polaroid-vide", T("vit.photo.vide")));
      if (ed) {
        var lg = el("input", "v-champ v-legende"); lg.maxLength = 60; lg.value = v.legende; lg.placeholder = T("vit.photo.legende");
        lg.oninput = function () { v.legende = lg.value; ctx.change(); };
        var b = el("button", "btn btn-line small", T(v.photo ? "vit.photo.changer" : "vit.photo.choisir")); b.type = "button";
        b.onclick = function () { ctx.choisirPhoto(); };
        box.appendChild(lg); box.appendChild(b);
      } else if (v.legende) box.appendChild(el("p", "v-legende", v.legende));
    } else if (e.b === "livre") {
      livre(box, ctx);
    }
    return box;
  }

  function livre(box, ctx) {
    var L = ctx.livre || { messages: [] }, msgs = L.messages || [];
    var liste = el("div", "v-livre");
    var tout = false;
    function dessiner() {
      liste.textContent = "";
      if (!msgs.length) liste.appendChild(el("p", "v-vide", T("vit.livre.vide")));
      (tout ? msgs : msgs.slice(0, 4)).forEach(function (m) {
        var d = el("div", "v-mot");
        var h = el("b", null, m.auteur_nom + " · " + new Date(m.created_at).toLocaleDateString(ctx.locale || "fr-FR", { day: "numeric", month: "long" }));
        d.appendChild(h); d.appendChild(el("p", null, m.message));
        if (L.peutEffacer && L.peutEffacer(m)) {
          var x = el("button", "v-mot-x", "✕"); x.type = "button"; x.setAttribute("aria-label", T("vit.livre.effacer")); x.title = T("vit.livre.effacer");
          x.onclick = async function () {
            if (!confirm(T("vit.livre.effacer_q"))) return;
            if (await L.effacer(m)) { msgs = L.messages = msgs.filter(function (z) { return z.id !== m.id; }); dessiner(); }
          };
          d.appendChild(x);
        }
        liste.appendChild(d);
      });
      if (msgs.length > 4 && !tout) {
        var plus = el("button", "v-lien", T("vit.livre.tout", { n: msgs.length })); plus.type = "button";
        plus.onclick = function () { tout = true; dessiner(); }; liste.appendChild(plus);
      }
    }
    dessiner();
    box.appendChild(liste);
    if (ctx.edition) return;
    if (L.peutEcrire) {
      var f = el("form", "v-livre-form");
      var nom = el("input", "v-champ"); nom.maxLength = 40; nom.required = true; nom.placeholder = T("vit.livre.prenom"); nom.value = L.prenom || "";
      var ta = el("textarea", "v-champ"); ta.maxLength = 300; ta.rows = 2; ta.required = true; ta.placeholder = T("vit.livre.ph");
      var ok = el("button", "btn btn-gold small", T("vit.livre.envoyer")); ok.type = "submit";
      var msg = el("p", "v-msg"); msg.setAttribute("role", "status");
      f.appendChild(nom); f.appendChild(ta); f.appendChild(ok); f.appendChild(msg);
      f.onsubmit = async function (ev) {
        ev.preventDefault();
        if (ta.value.trim().length < 2) { msg.textContent = T("vit.livre.court"); return; }
        ok.disabled = true; msg.textContent = "";
        var r = await L.ecrire(nom.value.trim(), ta.value.trim());
        ok.disabled = false;
        if (r && r.ok) { msgs.unshift(r.message); ta.value = ""; msg.textContent = T("vit.livre.merci"); dessiner(); }
        else msg.textContent = T(r && r.limite ? "vit.livre.limite" : "vit.livre.erreur");
      };
      box.appendChild(f);
    } else if (L.lienConnexion) {
      var a = el("a", "v-lien", T("vit.livre.connexion")); a.href = L.lienConnexion; box.appendChild(a);
    }
  }

  function sticker(e) {
    var d = STICKERS[e.s];
    if (typeof d === "string") { var s = el("span", "v-st v-emoji", d); s.setAttribute("aria-hidden", "true"); return s; }
    return el("span", "v-st " + d.c, T(d.k));
  }
  function note(e, ctx) {
    var n = el("div", "v-note v-note-" + e.c);
    n.appendChild(el("span", "v-scotch"));
    if (ctx.edition) {
      var ta = el("textarea", "v-note-champ"); ta.maxLength = 140; ta.rows = 4; ta.value = e.texte; ta.setAttribute("aria-label", T("vit.note"));
      ta.oninput = function () { e.texte = ta.value; ctx.change(); }; n.appendChild(ta);
      var cs = el("div", "v-note-couleurs");
      NOTES.forEach(function (c) {
        var b = el("button", "v-pastille v-note-" + c); b.type = "button"; b.setAttribute("aria-label", T("vit.note.c." + c));
        b.onclick = function () { e.c = c; ctx.change(true); }; cs.appendChild(b);
      });
      n.appendChild(cs);
    } else {
      if (!e.texte.trim()) return null;
      n.appendChild(el("p", null, e.texte));
    }
    return n;
  }

  /* ---------- Poignées d'édition ---------- */
  function outils(noeud, e, v, ctx, pile) {
    var bar = el("div", "v-outils");
    function b(txt, lab, fn) { var x = el("button", "v-outil", txt); x.type = "button"; x.setAttribute("aria-label", lab); x.title = lab; x.onclick = fn; bar.appendChild(x); return x; }
    if (pile && e.t !== "sticker") {
      var liste = v.elements.filter(function (z) { return z.t !== "sticker"; }).sort(function (a, c) { return a.o - c.o; });
      var i = liste.indexOf(e);
      function echange(j) { var a = liste[i], c = liste[j], t = a.o; a.o = c.o; c.o = t; if (a.o === c.o) a.o += j > i ? 1 : -1; ctx.change(true); }
      if (i > 0) b("↑", T("vit.monter"), function () { echange(i - 1); });
      if (i < liste.length - 1) b("↓", T("vit.descendre"), function () { echange(i + 1); });
    } else if (!pile) {
      var p = b("✥", T("vit.deplacer"), function () { });
      p.classList.add("v-poignee");
    }
    if (!pile) b("↻", T("vit.tourner"), function () { e.r = e.r >= 8 ? -8 : e.r + 4; ctx.change(true); });
    b("✕", T("vit.retirer"), function () {
      v.elements = v.elements.filter(function (z) { return z !== e && !(z.t === "sticker" && z.ancre === e.id && pile); });
      ctx.change(true);
    });
    noeud.appendChild(bar);
  }
  /* Glisser-déposer à la souris ou au doigt, sur la toile mise à l'échelle. */
  function glissable(noeud, e, ctx, echelle) {
    noeud.addEventListener("pointerdown", function (ev) {
      if (ev.button > 0 || ev.target.closest("textarea,input,select,.v-outil:not(.v-poignee),.v-pastille,.btn,a,button.v-obj")) return;
      ev.preventDefault();
      var x0 = ev.clientX, y0 = ev.clientY, ex = e.x, ey = e.y, w = noeud.offsetWidth;
      noeud.setPointerCapture(ev.pointerId); noeud.classList.add("v-glisse");
      function bouge(m) {
        e.x = Math.max(0, Math.min(LARGEUR - Math.min(w, LARGEUR), Math.round(ex + (m.clientX - x0) / echelle())));
        e.y = Math.max(0, Math.round(ey + (m.clientY - y0) / echelle()));
        noeud.style.left = e.x + "px"; noeud.style.top = e.y + "px";
      }
      function fin() {
        noeud.removeEventListener("pointermove", bouge); noeud.removeEventListener("pointerup", fin); noeud.removeEventListener("pointercancel", fin);
        noeud.classList.remove("v-glisse"); ctx.change(true);
      }
      noeud.addEventListener("pointermove", bouge); noeud.addEventListener("pointerup", fin); noeud.addEventListener("pointercancel", fin);
    });
  }

  /* ---------- Rendu ---------- */
  function construire(e, v, ctx) {
    var n;
    if (e.t === "bloc") { var c = blocContenu(e, v, ctx); if (!c) return null; n = el("section", "v-bloc v-bloc-" + e.b); n.appendChild(c); }
    else if (e.t === "note") { n = note(e, ctx); if (!n) return null; }
    else n = sticker(e);
    n.classList.add("v-el");
    n.dataset.id = e.id;
    return n;
  }
  function rendre(cible, donnees, ctx) {
    var v = donnees;
    cible.textContent = "";
    var pile = (ctx.pile != null) ? ctx.pile : cible.clientWidth < SEUIL;
    var zone = el("div", "vitrine v-fond-" + v.fond + (pile ? " v-pile" : " v-libre") + (ctx.edition ? " v-edition" : ""));
    cible.appendChild(zone);
    if (!pile) {
      var toile = el("div", "v-toile"); zone.appendChild(toile);
      var echelle = function () { return zone.clientWidth / LARGEUR; };
      v.elements.forEach(function (e) {
        var n = construire(e, v, ctx); if (!n) return;
        n.style.left = e.x + "px"; n.style.top = e.y + "px";
        if (e.t !== "sticker") n.style.width = largeur(e) + "px";
        n.style.setProperty("--r", e.r + "deg");
        if (ctx.edition) { outils(n, e, v, ctx, false); glissable(n, e, ctx, echelle); }
        toile.appendChild(n);
      });
      var ajuster = function () {
        var s = echelle(), h = 0;
        toile.style.transform = "scale(" + s + ")";
        [].forEach.call(toile.children, function (n) { h = Math.max(h, n.offsetTop + n.offsetHeight); });
        h += 40; toile.style.height = h + "px"; zone.style.height = Math.ceil(h * s) + "px";
      };
      ajuster();
      [].forEach.call(toile.querySelectorAll("img"), function (im) { if (!im.complete) im.addEventListener("load", ajuster); });
      zone._ajuster = ajuster;
    } else {
      ancrer(v);
      var hotes = v.elements.filter(function (z) { return z.t !== "sticker"; }).sort(function (a, b) { return a.o - b.o; });
      hotes.forEach(function (e) {
        var n = construire(e, v, ctx); if (!n) return;
        n.style.setProperty("--r", (e.t === "note" ? Math.max(-2, Math.min(2, e.r)) : 0) + "deg");
        if (ctx.edition) outils(n, e, v, ctx, true);
        var k = 0;
        v.elements.forEach(function (s) {
          if (s.t !== "sticker" || s.ancre !== e.id) return;
          var st = sticker(s); st.classList.add("v-accroche"); st.style.setProperty("--k", k++); st.style.setProperty("--r", s.r + "deg");
          if (ctx.edition) {
            var x = el("button", "v-outil v-st-x", "✕"); x.type = "button"; x.setAttribute("aria-label", T("vit.retirer"));
            x.onclick = function () { v.elements = v.elements.filter(function (z) { return z !== s; }); ctx.change(true); };
            st.appendChild(x);
          }
          n.appendChild(st);
        });
        zone.appendChild(n);
      });
    }
    return zone;
  }

  window.Vitrine = {
    LARGEUR: LARGEUR, SEUIL: SEUIL, FONDS: FONDS, STICKERS: STICKERS, BLOCS: BLOCS, NOTES: NOTES,
    defaut: defaut, propre: propre, ancrer: ancrer, rendre: rendre, id: id, largeur: largeur,
    visible: function (v) { return !!(v && v.elements && v.elements.length); }
  };
})();
