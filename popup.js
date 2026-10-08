(function () {
  const statusEl = document.getElementById("status");

  function isAllowedHost(hostname) {
    if (!hostname) return false;
    const allowed = CONFIG.ALLOWED_DOMAIN.toLowerCase();
    hostname = hostname.toLowerCase();
    return hostname === allowed || hostname.endsWith("." + allowed);
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) {
      statusEl.textContent = "No active tab.";
      return;
    }

    let hostname = "";
    try { hostname = new URL(tab.url).hostname; } catch (e) { }

    if (!isAllowedHost(hostname)) {
      statusEl.textContent = `Inactive here.\nThis extension only runs on: ${CONFIG.ALLOWED_DOMAIN}`;
      statusEl.classList.add("inactive");
      return;
    }

    // Read the stored status string
    chrome.storage.local.get(["globalStatus"], (result) => {
      statusEl.textContent = result.globalStatus || "Active. Waiting for a captcha to appear...";
    });

    // Listen for updates
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.globalStatus) {
        statusEl.textContent = changes.globalStatus.newValue;
      }
    });
  });
})();