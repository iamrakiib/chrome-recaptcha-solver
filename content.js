// content.js – clears stale session on CAPTCHA load
(function () {
  "use strict";

  function isAllowedDomain() {
    const allowed = CONFIG.ALLOWED_DOMAIN.toLowerCase();
    const host = location.hostname.toLowerCase();
    return host === allowed || host.endsWith("." + allowed);
  }

  if (!isAllowedDomain()) return;

  const SESSION_KEY = 'captchaSolverSession';
  const MAX_RETRIES = 2;

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp > 600000) {
          clearSession();
          return null;
        }
        return data;
      }
    } catch (e) { }
    return null;
  }

  function setSession() {
    const data = getSession();
    const retries = data ? data.retries + 1 : 0;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      active: true,
      retries: retries,
      timestamp: Date.now()
    }));
  }

  function isSessionActive() {
    const data = getSession();
    if (!data) return false;
    if (data.retries > MAX_RETRIES) return true;
    return data.active === true;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    console.log('[Captcha] Session cleared');
  }

  function resetSessionIfNotCaptcha() {
    const url = window.location.href;
    if (!url.includes('/sorry/') && !url.includes('recaptcha')) {
      if (getSession()) {
        clearSession();
        console.log('[Captcha] Session cleared – left CAPTCHA page');
      }
    }
  }

  setInterval(resetSessionIfNotCaptcha, 2000);
  window.addEventListener('popstate', resetSessionIfNotCaptcha);
  window.addEventListener('load', resetSessionIfNotCaptcha);

  const solvedWidgets = new WeakSet();
  const solvingInProgress = new Map();

  function setStatus(text) {
    chrome.storage.local.set({ globalStatus: text });
    chrome.runtime.sendMessage({ type: "STATUS_UPDATE", text }, () => {
      void chrome.runtime.lastError;
    });
  }

  setStatus("Active on " + location.hostname + " — watching for captchas.");

  function injectMainWorldScript() {
    try {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("inject.js");
      document.documentElement.appendChild(s);
      s.remove();
    } catch (e) {
      console.error("[captcha-solver] failed to inject MAIN-world script:", e);
    }
  }
  injectMainWorldScript();

  let cachedDataS = null;
  let lastDataSFetch = 0;

  function getGoogleDataS() {
    const now = Date.now();
    if (now - lastDataSFetch < 1000 && cachedDataS !== null) {
      return cachedDataS;
    }
    lastDataSFetch = now;
    cachedDataS = null;

    const html = document.documentElement.outerHTML;
    let match = html.match(/data-s["']?\s*[:=]\s*["']([^"']+)["']/i);
    if (match) {
      cachedDataS = match[1];
      return cachedDataS;
    }

    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const m = s.textContent.match(/(?:data_s|dataS)\s*[:=]\s*["']([^"']+)["']/i);
      if (m) {
        cachedDataS = m[1];
        return cachedDataS;
      }
    }

    const form = document.querySelector('form[action*="/sorry/index"]');
    if (form) {
      let ds = form.getAttribute('data-s');
      if (!ds) {
        const hidden = form.querySelector('input[name="data-s"]');
        if (hidden) ds = hidden.value;
      }
      if (ds) {
        cachedDataS = ds;
        return cachedDataS;
      }
    }

    document.querySelectorAll('[data-s]').forEach(el => {
      const ds = el.getAttribute('data-s');
      if (ds) cachedDataS = ds;
    });

    return cachedDataS;
  }

  getGoogleDataS();

  // ---------- On‑load: clear session if on CAPTCHA ----------
  // This prevents stale sessions from blocking new solves after a reload.
  (function clearStaleSessionOnCaptcha() {
    if (window.location.href.includes('/sorry/') || window.location.href.includes('recaptcha')) {
      if (getSession()) {
        console.log('[Captcha] On CAPTCHA page with active session – clearing for fresh solve');
        clearSession();
      }
    }
  })();

  function requestSolve(captchaType, siteKey, action, dataS) {
    const sessionData = getSession();
    if (sessionData) {
      if (sessionData.retries >= MAX_RETRIES) {
        console.warn('[Captcha] Max retries reached – blocking solve');
        return Promise.reject(new Error('Max retries exceeded for this session'));
      }
      if (sessionData.active) {
        console.warn('[Captcha] Session active – ignoring duplicate request');
        return Promise.reject(new Error('Session already active'));
      }
    }

    setSession();

    if (!dataS) dataS = getGoogleDataS();

    const dedupeKey = siteKey + (dataS || '');
    if (solvingInProgress.has(dedupeKey)) {
      console.warn('[Captcha] Duplicate key in progress – returning existing promise');
      return solvingInProgress.get(dedupeKey);
    }

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for background response (10min)'));
      }, 600000);

      chrome.runtime.sendMessage(
        { type: "SOLVE_CAPTCHA", captchaType, siteKey, action, dataS },
        (res) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res || !res.ok) {
            reject(new Error((res && res.error) || "Unknown error"));
            return;
          }
          resolve(res.token);
        }
      );
    });

    solvingInProgress.set(dedupeKey, promise);

    promise
      .then(() => {
        console.log('[Captcha] Solve succeeded, session remains active');
      })
      .catch((err) => {
        console.error('[Captcha] Solve error, clearing session for retry:', err.message);
        clearSession();
      })
      .finally(() => {
        solvingInProgress.delete(dedupeKey);
      });

    return promise;
  }

  async function submitTokenToGoogle(token) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (!textarea) {
        textarea = document.querySelector('textarea[id*="g-recaptcha-response"]');
      }
      if (!textarea) {
        textarea = document.querySelector('textarea[data-recaptcha]');
      }
      if (!textarea) {
        textarea = document.createElement('textarea');
        textarea.name = 'g-recaptcha-response';
        textarea.style.display = 'none';
        document.body.appendChild(textarea);
        console.log('[Captcha] Created hidden textarea');
      }

      textarea.value = token;
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      let form = document.querySelector('form[action*="/sorry/index"]');
      if (!form) {
        form = document.querySelector('form[action*="sorry"]');
      }
      if (!form) {
        form = document.forms[0];
      }

      if (form) {
        console.log(`[Captcha] Found form (attempt ${attempt}), submitting...`);

        try {
          if (form.requestSubmit) {
            form.requestSubmit();
            console.log('[Captcha] Submitted via requestSubmit()');
            return true;
          }
        } catch (e) { }

        try {
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            submitBtn.click();
            console.log('[Captcha] Submitted via clicking submit button');
            return true;
          }
        } catch (e) { }

        try {
          const checkbox = form.querySelector('#recaptcha-anchor, .recaptcha-checkbox-border, .rc-anchor-checkbox');
          if (checkbox) {
            checkbox.click();
            console.log('[Captcha] Clicked CAPTCHA checkbox');
            await new Promise(r => setTimeout(r, 500));
            if (form.requestSubmit) {
              form.requestSubmit();
            } else {
              form.submit();
            }
            return true;
          }
        } catch (e) { }

        try {
          form.submit();
          console.log('[Captcha] Submitted via form.submit()');
          return true;
        } catch (e) { }
      }

      console.warn(`[Captcha] Submit attempt ${attempt} failed – waiting ${attempt * 1000}ms`);
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
    console.error('[Captcha] All submit attempts failed');
    return false;
  }

  function isPageOnCaptcha() {
    const url = window.location.href;
    if (url.includes('/sorry/') || url.includes('recaptcha')) return true;
    const bodyText = document.body ? document.body.innerText : '';
    if (bodyText.includes('unusual traffic') || bodyText.includes('try your request again later')) {
      return true;
    }
    return false;
  }

  document.addEventListener("captcha-solver:widget-rendered", async (e) => {
    if (isSessionActive()) {
      console.log('[Captcha] Ignoring widget-rendered due to active session');
      return;
    }

    const { internalId, type, sitekey, action } = e.detail || {};
    if (!internalId || !sitekey) return;

    console.log('[Captcha] Received widget-rendered event for', sitekey);
    setStatus("Solving reCAPTCHA v2...");

    try {
      const dataS = getGoogleDataS();
      const token = await requestSolve("recaptcha_v2", sitekey, action, dataS);

      document.dispatchEvent(
        new CustomEvent("captcha-solver:token-ready", { detail: { internalId, token } })
      );

      console.log('[Captcha] Fallback: injecting token and submitting form');
      await submitTokenToGoogle(token);

      console.log('[Captcha] Waiting up to 15s for page to navigate...');
      let navigated = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!isPageOnCaptcha()) {
          navigated = true;
          break;
        }
      }

      if (navigated) {
        setStatus("reCAPTCHA v2 solved and navigated.");
        return;
      }

      console.warn('[Captcha] No navigation – clearing session and reloading');
      clearSession();
      setStatus("CAPTCHA retry...");
      window.location.reload();
    } catch (err) {
      setStatus("reCAPTCHA v2 error: " + err.message);
      console.error('[Captcha] Solve error:', err.message);
      setTimeout(() => {
        if (isPageOnCaptcha()) {
          console.warn('[Captcha] Error – reloading page');
          window.location.reload();
        }
      }, 5000);
    }
  });

  async function solveV2(el) {
    if (solvedWidgets.has(el)) return;
    if (isSessionActive()) {
      console.log('[Captcha] solveV2 skipped – session active');
      return;
    }

    solvedWidgets.add(el);
    const siteKey = el.getAttribute('data-sitekey');
    if (!siteKey) return;

    const dataS = getGoogleDataS();
    console.log('[Captcha] Direct solve v2 with siteKey:', siteKey);
    setStatus("Solving reCAPTCHA v2...");

    try {
      const token = await requestSolve("recaptcha_v2", siteKey, null, dataS);
      await submitTokenToGoogle(token);

      let navigated = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!isPageOnCaptcha()) {
          navigated = true;
          break;
        }
      }
      if (!navigated) {
        console.warn('[Captcha] No navigation – reloading for retry');
        clearSession();
        window.location.reload();
      }
      setStatus("reCAPTCHA v2 solved.");
    } catch (e) {
      setStatus("reCAPTCHA v2 error: " + e.message);
      solvedWidgets.delete(el);
    }
  }

  function findRecaptchaV2() {
    if (window.location.href.includes('/sorry/')) return [];
    const selectors = [
      '.g-recaptcha[data-sitekey]',
      '#captcha-form .g-recaptcha',
      'div[data-sitekey]'
    ];
    const elements = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (!solvedWidgets.has(el) && el.getAttribute('data-sitekey')) {
          elements.push(el);
        }
      });
    }
    return elements;
  }

  function scanAndSolve() {
    if (isSessionActive()) return;
    if (window.location.href.includes('/sorry/')) return;

    const widgets = findRecaptchaV2();
    if (widgets.length) console.log('[Captcha] scanAndSolve found', widgets.length, 'widgets');
    widgets.forEach(solveV2);
  }

  scanAndSolve();

  const mutationObserver = new MutationObserver(() => {
    if (isSessionActive()) return;
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndSolve, 500);
  });
  let scanTimeout;
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sitekey', 'class']
  });

  setInterval(() => {
    if (!isSessionActive()) {
      scanAndSolve();
    }
  }, 2000);

  setTimeout(scanAndSolve, 1500);

})();