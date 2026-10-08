importScripts("config.js");

function isAllowedHost(hostname) {
  if (!hostname) return false;
  const allowed = CONFIG.ALLOWED_DOMAIN.toLowerCase();
  hostname = hostname.toLowerCase();
  return hostname === allowed || hostname.endsWith("." + allowed);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function solveCaptcha({ captchaType, siteKey, action, dataS }, pageUrl) {
  if (!CONFIG.TWOCAPTCHA_API_KEY || CONFIG.TWOCAPTCHA_API_KEY === "YOUR_2CAPTCHA_API_KEY") {
    throw new Error("2captcha API key is not set. Edit config.js.");
  }

  const params = new URLSearchParams({
    key: CONFIG.TWOCAPTCHA_API_KEY,
    pageurl: pageUrl,
    json: "1"
  });

  switch (captchaType) {
    case "recaptcha_v2":
      params.set("method", "userrecaptcha");
      params.set("googlekey", siteKey);
      if (dataS) {
        params.set("data-s", dataS);
        console.log('[2Captcha] Additional challenge metadata provided.');
      } else {
        console.warn('[2Captcha] ⚠️ No data-s provided');
      }
      break;
    default:
      throw new Error("Unsupported captcha type: " + captchaType);
  }

  const fullUrl = `https://2captcha.com/in.php?${params.toString()}`;
  console.log('[2Captcha] Submitting CAPTCHA task.');

  const submitRes = await fetch(fullUrl);
  const submitData = await submitRes.json();
  console.log('[2Captcha] Submission status:', submitData.status);

  if (submitData.status !== 1) {
    throw new Error("2captcha submit error: " + submitData.request);
  }
  const taskId = submitData.request;

  console.log('[2Captcha] Task created. Polling...');

  for (let attempt = 0; attempt < CONFIG.MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(CONFIG.POLL_INTERVAL_MS);

    const pollUrl = `https://2captcha.com/res.php?key=${encodeURIComponent(CONFIG.TWOCAPTCHA_API_KEY)}&action=get&id=${encodeURIComponent(taskId)}&json=1`;
    const pollRes = await fetch(pollUrl);
    const pollData = await pollRes.json();

    console.log(`[2Captcha] Poll attempt ${attempt + 1}; status: ${pollData.status}`);

    if (pollData.status === 1) {
      console.log('[2Captcha] CAPTCHA solved.');
      return pollData.request;
    }
    if (pollData.request !== "CAPCHA_NOT_READY") {
      throw new Error("2captcha poll error: " + pollData.request);
    }
  }

  throw new Error(`Timed out after ${CONFIG.MAX_POLL_ATTEMPTS} attempts.`);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "STATUS_UPDATE") {
    if (sender.tab && sender.tab.id != null) {
      chrome.storage.local.set({ ["status_" + sender.tab.id]: msg.text });
    }
    return;
  }

  if (msg.type === "SOLVE_CAPTCHA") {
    const tabUrl = sender.tab && sender.tab.url ? new URL(sender.tab.url) : null;
    if (!tabUrl || !isAllowedHost(tabUrl.hostname)) {
      sendResponse({ ok: false, error: "Domain not allowed for this extension." });
      return;
    }

    solveCaptcha(msg, tabUrl.href)
      .then(token => sendResponse({ ok: true, token }))
      .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));

    return true;
  }
});