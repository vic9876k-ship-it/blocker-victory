document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     GET BLOCKED URL
  ========================= */

  const params = new URLSearchParams(window.location.search);

  // Matches:
  // blocked.html?blockedUrl=https://youtube.com
  const blockedUrl =
    params.get("blockedUrl") || "unknown";

  /* =========================
     DISPLAY DOMAIN
  ========================= */

  let displayDomain = blockedUrl;

  try {
    displayDomain = new URL(blockedUrl)
      .hostname
      .replace(/^www\./, "");
  } catch (err) {
    console.warn("[Victory] Failed to parse URL:", blockedUrl);
  }

  const domainEl = document.getElementById("domain");

  if (domainEl) {
    domainEl.textContent = displayDomain;
  }

  /* =========================
     SEND LOG
     KEEPING ORIGINAL FLOW
  ========================= */

  chrome.runtime.sendMessage(
    {
      type: "LOG_BLOCKED_VISIT",
      domain: blockedUrl,
      timestamp: Date.now()
    },
    (response) => {

      if (chrome.runtime.lastError) {
        console.error(
          "[Victory] Log failed:",
          chrome.runtime.lastError.message
        );
        return;
      }

      console.log(
        "[Victory] Log response:",
        response
      );
    }
  );
// blocked.js
// Sends only domain to background script, not full URL

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const blockedUrl = params.get("blockedUrl") || "";
  
  // Extract and sanitize domain only
  let domain = "Unknown";
  try {
    if (blockedUrl) {
      const url = new URL(decodeURIComponent(blockedUrl));
      domain = url.hostname.replace(/^www\./, "");
    }
  } catch (e) {
    domain = decodeURIComponent(blockedUrl).substring(0, 100);
  }
  
  const urlEl = document.getElementById("blockedUrl");
  if (urlEl) {
    urlEl.textContent = domain;
  }
  
  // Log with domain only (privacy)
  try {
    chrome.runtime.sendMessage({
      type: "LOG_BLOCKED_VISIT",
      domain: domain
    });
  } catch (e) {
    console.error("[Victory] Failed to log blocked visit:", e);
  }
});
  /* =========================
     GO BACK BUTTON
  ========================= */

  const goBackBtn =
    document.getElementById("goBackBtn");

  if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {

      if (window.history.length > 1) {
        window.history.back();
      } else {
        chrome.runtime.sendMessage({
          type: "CLOSE_TAB"
        });
      }

    });
  }


});