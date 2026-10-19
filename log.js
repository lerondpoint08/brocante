/* Journal de bord du site, pour la maintenance.
   - Les erreurs et avertissements s'écrivent toujours dans la console du navigateur (touche F12 sur PC).
   - Pour afficher aussi les informations détaillées : ajoutez ?debug=1 à l'adresse du site (?debug=0 pour arrêter).
     Un bouton « Copier le journal » apparaît alors en bas à gauche : il copie les derniers événements, prêts à être envoyés.
   - Aucune adresse e-mail, aucun mot de passe et aucun jeton de connexion n'est enregistré dans le journal.
   - Le journal reste dans le navigateur de la personne : rien n'est envoyé à un serveur. */
(function () {
  "use strict";

  var MAX = 150;
  var KEY = "brocante_log";
  var FLAG = "brocante_debug";
  var page = /espace\.html$/.test(location.pathname) ? "espace" : "public";
  var entries = [];

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* stockage indisponible : on continue sans */ }
    return null;
  }

  var q = new URLSearchParams(location.search).get("debug");
  if (q === "1") ls(FLAG, "1"); else if (q === "0") ls(FLAG, null);
  var debugOn = ls(FLAG) === "1";

  try {
    var old = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    if (Array.isArray(old)) entries = old.slice(-MAX);
  } catch (e) { entries = []; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) { /* ignoré */ } }

  /* Masque tout ce qui pourrait être personnel ou secret avant d'écrire une ligne. */
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var JETON = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
  var PARAM = /([#?&](?:access_token|refresh_token|token|token_hash|code|apikey)=)[^&\s]+/gi;
  function clean(v) {
    var s;
    if (typeof v === "string") s = v;
    else { try { s = JSON.stringify(v); } catch (e) { s = String(v); } }
    if (s == null) s = "";
    return String(s).replace(EMAIL, "[e-mail]").replace(JETON, "[jeton]").replace(PARAM, "$1[masqué]").slice(0, 600);
  }

  function add(level, ctx, msg) {
    var e = { t: new Date().toISOString(), p: page, l: level, c: String(ctx), m: clean(msg) };
    entries.push(e);
    if (entries.length > MAX) entries.shift();
    save();
    var visible = (level === "debug" || level === "info") ? debugOn : true;
    if (visible && window.console) {
      var fn = console[level === "debug" ? "log" : level] || console.log;
      fn.call(console, "[brocante]", e.c + " :", e.m);
    }
    return e;
  }

  /* Erreur renvoyée par Supabase (base, connexion, photos) ou erreur JavaScript : on garde seulement les champs utiles. */
  function supa(ctx, err) {
    if (!err) return null;
    var o = {};
    ["name", "code", "status", "statusCode", "message", "details", "hint"].forEach(function (k) {
      if (err[k] != null && err[k] !== "") o[k] = err[k];
    });
    if (!Object.keys(o).length) o.message = String(err);
    return add("error", ctx, o);
  }

  function dump() {
    return entries.map(function (e) {
      return e.t + " [" + e.p + "] " + e.l.toUpperCase() + " " + e.c + " : " + e.m;
    }).join("\n");
  }

  function copy() {
    var tete = "Journal du site\n" +
      "Page : " + location.origin + location.pathname + location.search + "\n" +
      "Écran : " + (window.innerWidth || "?") + "x" + (window.innerHeight || "?") + "\n" +
      "Navigateur : " + clean(navigator.userAgent) + "\n";
    var txt = tete + "\n" + dump();
    function secours() {
      var ok = false;
      try {
        var ta = document.createElement("textarea");
        ta.value = txt; ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e) { ok = false; }
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return secours(); });
    }
    return Promise.resolve(secours());
  }

  /* Erreurs JavaScript non gérées, et ressources qui ne se chargent pas (script, image, feuille de style). */
  window.addEventListener("error", function (ev) {
    var t = ev.target;
    if (t && t !== window && (t.src || t.href)) {
      add("warn", "ressource", "échec de chargement : " + String(t.src || t.href).split(/[?#]/)[0]);
      return;
    }
    var fichier = String(ev.filename || "").split("/").pop().split("?")[0];
    add("error", "js", (ev.message || "erreur") + " (" + fichier + ":" + ev.lineno + ")");
  }, true);
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    supa("promesse non gérée", r && typeof r === "object" ? r : { message: r });
  });
  window.addEventListener("offline", function () { add("warn", "réseau", "connexion perdue"); });
  window.addEventListener("online", function () { add("info", "réseau", "connexion rétablie"); });

  function badge() {
    if (!debugOn || !document.body) return;
    var b = document.createElement("button");
    b.type = "button"; b.textContent = "Copier le journal";
    b.style.cssText = "position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:40;min-height:44px;padding:0 14px;" +
      "border-radius:999px;border:2px solid #2A1E05;background:#F7CB52;color:#2A1E05;font:700 .9rem system-ui,sans-serif;cursor:pointer";
    b.onclick = function () {
      copy().then(function (ok) {
        b.textContent = ok ? "Journal copié" : "Copie impossible";
        setTimeout(function () { b.textContent = "Copier le journal"; }, 2500);
      });
    };
    document.body.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", badge); else badge();

  window.LOG = {
    debug: function (ctx, msg) { return add("debug", ctx, msg); },
    info: function (ctx, msg) { return add("info", ctx, msg); },
    warn: function (ctx, msg) { return add("warn", ctx, msg); },
    error: function (ctx, err) { return err && typeof err === "object" ? supa(ctx, err) : add("error", ctx, err); },
    supa: supa,
    dump: dump,
    copy: copy
  };

  add("info", "page", page + " chargée (" + (navigator.onLine === false ? "hors ligne" : "en ligne") + ")");
  if (debugOn && window.console) console.info("[brocante] mode détaillé activé. Pour l'arrêter : ajoutez ?debug=0 à l'adresse.");
})();
