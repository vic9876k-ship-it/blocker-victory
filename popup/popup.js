// src/popup/popup.js

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", () => {

  const loginBtn = document.getElementById("googleBtn");
  const logoutBtn = document.getElementById("signOutBtn");
  const status = document.getElementById("status");
  const pairingEl = document.getElementById("pairingCode");

  const expiryEl = document.getElementById("expiry");

  console.log({
  loginBtn,
  logoutBtn,
  status,
  pairingEl,
  expiryEl
});

if (!loginBtn) console.error("Missing #googleBtn");
if (!logoutBtn) console.error("Missing #signOutBtn");
if (!status) console.error("Missing #status");
if (!pairingEl) console.error("Missing #pairingCode");
if (!expiryEl) console.error("Missing #expiry");

if (!loginBtn || !logoutBtn || !status || !pairingEl || !expiryEl) {
  return;
}

  // LOAD STATE FROM STORAGE
  chrome.storage.local.get(["userEmail","displyName", "pairingCode", "pairingExpiresAt"], (res) => {
    if (res.userEmail && res.userEmail !== "Pending Login...") {
      status.textContent = `Signed in as ${res.userEmail}`;
      loginBtn.style.display = "none";
      logoutBtn.style.display = "block";
    } else if (res["pairingCode"]) {
      status.textContent = "Waiting for device pairing...";
      loginBtn.style.display = "none";
      logoutBtn.style.display = "block";
    }
    const displayName =
    document.getElementById("displayName").value.trim();



    if (res.pairingExpiresAt) {
      const remaining = Math.max(0, res.pairingExpiresAt - Date.now());
      expiryEl.textContent = `Expires in ${Math.floor(remaining / 60000)} min`;
    }
  });

  // ==================== LOGIN ====================
  loginBtn.addEventListener("click", () => {
    status.textContent = "Signing in with Google...";
    loginBtn.disabled = true;

   const displayName =
    document.getElementById("displayName").value.trim();

if (!displayName) {
    alert("Please enter a display name.");
    return;
}

chrome.storage.local.set(
    { displayName },
    () => {
        chrome.runtime.sendMessage(
            { type: "LOGIN" },
            (res) => {
                loginBtn.disabled = false;

                if (res?.ok) {
                    status.textContent = "Login successful! Pairing code generated.";
                    loginBtn.style.display = "none";
                    logoutBtn.style.display = "block";
                    pairingEl.textContent = res.pairingCode || "------";
                } else {
                    status.textContent = res?.error || "Login failed";
                }
            }
        );
    }
);
  });

  // ==================== LOGOUT ====================
  logoutBtn.addEventListener("click", () => {
    status.textContent = "Logging out...";
    logoutBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "LOGOUT" }, (res) => {
      logoutBtn.disabled = false;

      if (res?.ok) {
        status.textContent = "Not signed in";
        loginBtn.style.display = "block";
        logoutBtn.style.display = "none";
        pairingEl.textContent = "------";
        expiryEl.textContent = "";
      } else {
        status.textContent = "Logout failed";
        console.error("[LaviX] Logout failed:", res?.error);
      }
    });
  });

  // ==================== INCOGNITO PROTECTION CHECK ====================
  const incognitoStatus = document.getElementById("incognitoStatus");
  const incognitoGuide = document.getElementById("incognitoGuide");
  const incognitoIcon = document.getElementById("incognitoIcon");
  const enableIncognitoBtn = document.getElementById("enableIncognitoBtn");

  if (typeof chrome !== "undefined" && chrome.extension && chrome.extension.isAllowedIncognitoAccess) {
    chrome.extension.isAllowedIncognitoAccess((allowed) => {
      if (!incognitoStatus || !incognitoGuide || !incognitoIcon) return;

      if (allowed) {
        // Enabled — green, compact
        incognitoStatus.textContent = "Incognito protection enabled";
        incognitoStatus.style.color = "#22c55e";
        incognitoIcon.style.stroke = "#22c55e";
        incognitoGuide.style.display = "none";
      } else {
        // Disabled — red alert, show guide
        incognitoStatus.textContent = "Incognito protection OFF";
        incognitoStatus.style.color = "#ef4444";
        incognitoIcon.style.stroke = "#ef4444";
        incognitoGuide.style.display = "block";
        // Change icon to alert circle
        incognitoIcon.innerHTML = `
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" x2="12" y1="8" y2="12"/>
          <line x1="12" x2="12.01" y1="16" y2="16"/>
        `;
      }
    });
  }

  // Open Chrome extensions settings when user clicks enable button
  if (enableIncognitoBtn) {
    enableIncognitoBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
      }
    });
  }
});