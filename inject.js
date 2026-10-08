// Runs in MAIN world – wraps grecaptcha and dispatches events.
(function () {
  "use strict";

  if (window.__captchaSolverInjected) return;
  window.__captchaSolverInjected = true;

  function diag(msg) {
    try { console.log("[captcha-solver] " + msg); } catch (e) { }
  }

  diag("inject.js loaded in MAIN world");

  function isSessionActive() {
    try {
      const raw = sessionStorage.getItem('captchaSolverSession');
      if (raw) {
        const data = JSON.parse(raw);
        return data.active === true;
      }
    } catch (e) { }
    return false;
  }

  try {
    document.dispatchEvent(new CustomEvent("captcha-solver:engine-ready"));
  } catch (e) { }

  const pending = new Map();
  const lastAnnounce = new Map();
  const scannedClients = new Set();
  let counter = 0;
  let lastToken = null;
  const RESOLVE_COOLDOWN_MS = 15000;

  function announce(type, sitekey, action, callback) {
    if (isSessionActive()) {
      diag('Session active – skipping announce');
      return;
    }
    if (!sitekey) return;
    const dedupeKey = type + "|" + sitekey + "|" + (action || "");
    const now = Date.now();
    const prev = lastAnnounce.get(dedupeKey);
    if (prev && now - prev < RESOLVE_COOLDOWN_MS) return;
    lastAnnounce.set(dedupeKey, now);

    const internalId = "cs_" + Date.now() + "_" + ++counter;
    pending.set(internalId, typeof callback === "function" ? callback : function () { });
    diag("captcha detected: " + type + " sitekey=" + String(sitekey).slice(0, 12) + "...");
    document.dispatchEvent(
      new CustomEvent("captcha-solver:widget-rendered", {
        detail: { internalId, type, sitekey, action }
      })
    );
  }

  document.addEventListener("captcha-solver:token-ready", (e) => {
    const detail = e.detail || {};
    if (detail.token) lastToken = detail.token;
    const cb = pending.get(detail.internalId);
    if (cb) {
      pending.delete(detail.internalId);
      try { cb(detail.token); } catch (err) { console.error("[captcha-solver] site callback threw:", err); }
    }
  });

  function wrapGetResponse(obj) {
    if (!obj || typeof obj.getResponse !== "function" || obj.getResponse.__csWrapped) return;
    const orig = obj.getResponse;
    obj.getResponse = function wrapped() {
      let native = "";
      try { native = orig.apply(this, arguments); } catch (e) { }
      return native || lastToken || "";
    };
    obj.getResponse.__csWrapped = true;
  }

  function wrapRender(obj, methodName, type) {
    if (!obj || typeof obj[methodName] !== "function" || obj[methodName].__csWrapped) return;
    const orig = obj[methodName];
    obj[methodName] = function wrapped(container, params) {
      const widgetId = orig.apply(this, arguments);
      try {
        if (params && params.sitekey) {
          const cb = typeof params.callback === "function" ? params.callback : (token) => {
            const field = document.getElementById("g-recaptcha-response-" + widgetId) ||
              document.querySelector('textarea[name="g-recaptcha-response"]');
            if (field) { field.value = token; field.dispatchEvent(new Event("change", { bubbles: true })); }
          };
          announce(type, params.sitekey, params.action, cb);
        }
      } catch (err) { console.error("[captcha-solver] render hook error:", err); }
      return widgetId;
    };
    obj[methodName].__csWrapped = true;
    diag("hooked " + type + ".render()");
  }

  function wrapExecute(obj, type) {
    if (!obj || typeof obj.execute !== "function" || obj.execute.__csWrapped) return;
    const orig = obj.execute;
    obj.execute = function wrapped(siteKeyOrWidgetId, options) {
      if (typeof siteKeyOrWidgetId !== "string") {
        return orig.apply(this, arguments);
      }
      if (isSessionActive()) {
        diag('Session active – skipping execute() dispatch');
        return orig.apply(this, arguments);
      }
      return new Promise((resolve, reject) => {
        const internalId = "cs_" + Date.now() + "_" + ++counter;
        pending.set(internalId, resolve);
        document.dispatchEvent(
          new CustomEvent("captcha-solver:widget-rendered", {
            detail: { internalId, type, sitekey: siteKeyOrWidgetId, action: options && options.action }
          })
        );
        setTimeout(() => {
          if (pending.has(internalId)) {
            pending.delete(internalId);
            orig.apply(obj, arguments).then(resolve, reject);
          }
        }, 45000);
      });
    };
    obj.execute.__csWrapped = true;
    diag("hooked " + type + ".execute()");
  }

  function scanGrecaptchaClients() {
    const cfg = window.___grecaptcha_cfg;
    if (!cfg || !cfg.clients) return;
    for (const clientId of Object.keys(cfg.clients)) {
      if (scannedClients.has(clientId)) continue;
      const client = cfg.clients[clientId];
      if (!client || typeof client !== "object") continue;
      let sitekey = null;
      let callback = null;
      for (const topKey of Object.keys(client)) {
        const top = client[topKey];
        if (!top || typeof top !== "object") continue;
        for (const subKey of Object.keys(top)) {
          const sub = top[subKey];
          if (sub && typeof sub === "object" && "sitekey" in sub && "size" in sub) {
            sitekey = sub.sitekey;
            if (typeof sub.callback === "function") callback = sub.callback;
            else if (typeof sub.callback === "string" && typeof window[sub.callback] === "function") callback = window[sub.callback];
          }
        }
      }
      if (sitekey) {
        scannedClients.add(clientId);
        announce("recaptcha_v2", sitekey, null, callback);
      }
    }
  }

  function tick() {
    if (window.grecaptcha) {
      wrapRender(window.grecaptcha, "render", "recaptcha_v2");
      wrapExecute(window.grecaptcha, "recaptcha_v3");
      wrapGetResponse(window.grecaptcha);
      if (window.grecaptcha.enterprise) {
        wrapRender(window.grecaptcha.enterprise, "render", "recaptcha_v2");
        wrapExecute(window.grecaptcha.enterprise, "recaptcha_v3");
        wrapGetResponse(window.grecaptcha.enterprise);
      }
      scanGrecaptchaClients();
    }
    if (window.hcaptcha) {
      wrapRender(window.hcaptcha, "render", "hcaptcha");
      wrapGetResponse(window.hcaptcha);
    }
    if (window.turnstile) wrapRender(window.turnstile, "render", "turnstile");
  }

  tick();
  setInterval(tick, 200);
})();