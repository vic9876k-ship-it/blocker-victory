// background.js — FIXED VERSION with direct DNR logging

const LOG_COOLDOWN = 15 * 1000;
const FIRESTORE_REST_API = "https://firestore.googleapis.com/v1";
const FIREBASE_AUTH_API = "https://identitytoolkit.googleapis.com/v1";

const firebaseConfig = {
  apiKey: "AIzaSyCR8dZBRmgjHVPzcmlGc2odAz14eh4WjLc",
  authDomain: "victory-fb944.firebaseapp.com",
  projectId: "victory-fb944",
  storageBucket: "victory-fb944.firebasestorage.app",
  messagingSenderId: "650310438797",
  appId: "1:650310438797:web:d938478b38f6f3275137c4",
  measurementId: "G-K6PRVV72B6"
};

let blockedSites = [];
const recentLogs = new Map();

const SAFE_DOMAINS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "accounts.google.com",
  "apis.google.com",
  "googleapis.com",
  "googleusercontent.com",
  "firebaseapp.com",
  "google.com",
  "gstatic.com",
  "chrome-extension"
];

const MAX_LOGS_PER_MINUTE = 30;
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const MAX_HEARTBEAT_RETRIES = 3;
const MAX_URL_LENGTH = 2048;
const MAX_MESSAGE_LENGTH = 500;
const OFFLINE_QUEUE_MAX = 50;
const OFFLINE_RETRY_INTERVAL_MS = 10 * 1000;
/* =========================
   ENCOURAGEMENT SETTINGS
========================= */

const ENCOURAGEMENT_ALARM = "victoryEncouragement";
const ENCOURAGEMENT_INTERVAL_MINUTES = 120; // 2 hours

const ENCOURAGEMENT_MESSAGES = [

"You've made it this far. Keep going.",

"One good decision at a time.",

"Your future is built by today's choices.",

"Remember why you started.",

"Temptation passes. Character remains.",

"You are training your mind, not just resisting a website.",

"Every victory weakens the habit.",

"Don't trade long-term peace for short-term pleasure.",

"Take a short walk. Drink some water. Reset your mind.",

"You've overcome every difficult day you've faced so far."

];

let globalLogTimestamps = [];
let heartbeatRetryCount = 0;
let heartbeatTimer = null;
let offlineRetryTimer = null;

/* =========================
   OFFLINE QUEUE MANAGEMENT
========================= */
async function getOfflineQueue() {
  const { offlineQueue } = await chrome.storage.local.get("offlineQueue");
  return Array.isArray(offlineQueue) ? offlineQueue : [];
}

async function addToOfflineQueue(logEntry) {
  const queue = await getOfflineQueue();
  queue.push({
    ...logEntry,
    queuedAt: Date.now()
  });
  
  if (queue.length > OFFLINE_QUEUE_MAX) {
    queue.splice(0, queue.length - OFFLINE_QUEUE_MAX);
  }
  
  await chrome.storage.local.set({ offlineQueue: queue });
  console.log("[Victory] Queued offline log. Queue size:", queue.length);
}

async function clearOfflineQueue() {
  await chrome.storage.local.set({ offlineQueue: [] });
}

async function processOfflineQueue() {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;
  
  console.log("[Victory] Processing offline queue:", queue.length);
  
  const successful = [];
  
  for (const entry of queue) {
    try {
      await firestoreWrite("blockedVisits", entry, false);
      successful.push(entry);
    } catch (err) {
      console.warn("[Victory] Failed to send queued log:", err.message);
      break;
    }
  }
  
  const remaining = queue.filter(q => !successful.includes(q));
  await chrome.storage.local.set({ offlineQueue: remaining });
  
  if (successful.length > 0) {
    console.log("[Victory] Sent", successful.length, "queued logs");
  }
}

function startOfflineRetryLoop() {
  if (offlineRetryTimer) clearInterval(offlineRetryTimer);
  offlineRetryTimer = setInterval(processOfflineQueue, OFFLINE_RETRY_INTERVAL_MS);
}

/* =========================
   CRYPTO / PRIVACY HELPERS
========================= */
async function hashDomain(domain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(domain.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

/* =========================
   SAFE sites.json loader
========================= */
async function loadBlockedSites() {
  try {
    const json = await (await fetch(chrome.runtime.getURL("sites.json"))).json();

    blockedSites =
      Array.isArray(json) ? json :
      Array.isArray(json.sites) ? json.sites :
      Array.isArray(json.blocked) ? json.blocked :
      [];

    console.log("[Victory] sites loaded:", blockedSites.length);

    await updateDNRRules();
  } catch (err) {
    console.error("[Victory] failed to load sites.json", err);
  }
}

/* =========================
   DNR BLOCKING + REDIRECT TO blocked.html
========================= */
function buildRules(sites) {
  const allowedDomains = SAFE_DOMAINS;

  return (sites || [])
    .map((site, i) => {
      if (!site) return null;

      const clean = String(site)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();

      const isProtected = allowedDomains.some(domain =>
        clean.includes(domain)
      );

      if (isProtected) {
        console.warn("[Victory] skipped protected domain:", clean);
        return null;
      }

      return {
        id: i + 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            regexSubstitution: chrome.runtime.getURL("blocked.html?blockedUrl=\\0")
          }
        },
        condition: {
          regexFilter: `^https?:\\/\\/([^\\/]+\\.)?${clean.replace(/\./g, "\\.")}\\/?.*`,
          resourceTypes: ["main_frame"]
        }
      };
    })
    .filter(Boolean);
}

async function updateDNRRules() {
  try {
    if (!chrome.declarativeNetRequest) {
      console.error("[Victory] DNR not available");
      return;
    }

    const rules = buildRules(blockedSites);
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: rules
    });

    console.log("[Victory] DNR rules updated:", rules.length);
  } catch (err) {
    console.error("[Victory] DNR update failed", err);
  }
}

/* =========================
   REAL FIREBASE AUTH
========================= */
async function exchangeGoogleTokenForFirebase(googleAccessToken) {
  try {
    const requestUri = `https://${chrome.runtime.id}.chromiumapp.org`;
    const postBody = `access_token=${encodeURIComponent(googleAccessToken)}&providerId=google.com`;

    const res = await fetch(
      `${FIREBASE_AUTH_API}/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestUri: requestUri,
          postBody: postBody,
          providerId: "google.com",
          returnIdpCredential: true,
          returnSecureToken: true
        })
      }
    );

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `Firebase auth failed: ${res.status}`);
    }

    const data = await res.json();

    return {
      localId: data.localId,
      email: sanitizeString(data.email) || "",
      displayName: sanitizeString(data.displayName) || (data.email ? data.email.split("@")[0] : "User"),
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn || "3600",
      photoUrl: sanitizeString(data.photoUrl) || "",
      registered: data.registered || false
    };
  } catch (e) {
    console.error("[Victory] Firebase auth exchange failed", e);
    throw e;
  }
}

async function refreshFirebaseToken(refreshToken) {
  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
      }
    );

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `Token refresh failed: ${res.status}`);
    }

    const data = await res.json();

    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      userId: data.user_id
    };
  } catch (e) {
    console.error("[Victory] token refresh failed", e);
    throw e;
  }
}

async function getValidFirebaseToken() {
  const { firebaseIdToken, firebaseRefreshToken, firebaseTokenExpiry } = await chrome.storage.local.get([
    "firebaseIdToken",
    "firebaseRefreshToken",
    "firebaseTokenExpiry"
  ]);

  const now = Date.now();

  if (firebaseIdToken && firebaseTokenExpiry && now < firebaseTokenExpiry - 5 * 60 * 1000) {
    return firebaseIdToken;
  }

  if (firebaseRefreshToken) {
    try {
      const refreshed = await refreshFirebaseToken(firebaseRefreshToken);
      const expiry = now + (parseInt(refreshed.expiresIn) * 1000);

      await chrome.storage.local.set({
        firebaseIdToken: refreshed.idToken,
        firebaseRefreshToken: refreshed.refreshToken,
        firebaseTokenExpiry: expiry
      });

      return refreshed.idToken;
    } catch (e) {
      console.error("[Victory] failed to refresh token, need re-login", e);
      await chrome.storage.local.remove(["firebaseIdToken", "firebaseRefreshToken", "firebaseTokenExpiry"]);
      throw new Error("Session expired. Please log in.");
    }
  }

  throw new Error("No valid Firebase token available. Please log in.");
}

/* =========================
   SANITIZATION
========================= */
function sanitizeString(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[<>\"']/g, "").trim();
}

/* =========================
   DEVICE + DOMAIN HELPERS
========================= */
async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;

  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

function sanitizeDomain(domain) {
  if (!domain) return null;
  
  // Handle full URLs like https://www.example.com/path
  try {
    if (domain.includes('://')) {
      const url = new URL(domain);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch (e) {
    // Fallback for invalid URLs
  }
  
  return domain.toLowerCase().replace(/^www\./, "").split("/")[0];
}

/* =========================
   FIRESTORE WRITE (with offline fallback)
========================= */
async function firestoreWrite(collectionPath, data, allowOffline = true) {
  try {
    console.log("[Victory] Attempting Firestore write to", collectionPath);
    
    const firebaseIdToken = await getValidFirebaseToken();
    console.log("[Victory] Got valid token");

    const documentId = crypto.randomUUID();
    const url = `${FIRESTORE_REST_API}/projects/${firebaseConfig.projectId}/databases/(default)/documents/${collectionPath}?documentId=${documentId}`;

    const sanitizedData = {};
    for (const [key, value] of Object.entries(data)) {
      const cleanKey = sanitizeString(key) || key;
      if (typeof value === "string") {
        sanitizedData[cleanKey] = sanitizeString(value).substring(0, 
          cleanKey === "message" ? MAX_MESSAGE_LENGTH : 
          cleanKey === "domain" ? MAX_URL_LENGTH : 500
        );
      } else if (typeof value === "boolean") {
        sanitizedData[cleanKey] = value;
      } else if (typeof value === "number") {
        sanitizedData[cleanKey] = value;
      } else {
        sanitizedData[cleanKey] = sanitizeString(String(value));
      }
    }

    console.log("[Victory] Payload fields:", Object.keys(sanitizedData));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(sanitizedData).map(([k, v]) => [
            k.trim(),
            typeof v === "string"
              ? { stringValue: v }
              : typeof v === "boolean"
              ? { booleanValue: v }
              : typeof v === "number"
              ? { integerValue: String(v) }
              : { stringValue: String(v) }
          ])
        )
      })
    });

    console.log("[Victory] Response status:", res.status);

    if (!res.ok) {
      const err = await res.json();
      console.error("[Victory] Firestore error response:", JSON.stringify(err));
      throw new Error(err.error?.message || `Firestore write failed: ${res.status}`);
    }

    const result = await res.json();
    console.log("[Victory] Firestore write SUCCESS, doc:", result.name?.split("/").pop());
    return result;
  } catch (err) {
    console.error("[Victory] Firestore write FAILED:", err.message);
    
    if (allowOffline) {
      console.log("[Victory] Queuing for offline retry");
      await addToOfflineQueue(data);
    }
    throw err;
  }
}

async function firestoreUpdate(docPath, data) {
  try {
    const firebaseIdToken = await getValidFirebaseToken();

    const url = `${FIRESTORE_REST_API}/projects/${firebaseConfig.projectId}/databases/(default)/documents/${docPath}`;

    const sanitizedData = {};
    for (const [key, value] of Object.entries(data)) {
      const cleanKey = sanitizeString(key) || key;
      if (typeof value === "string") {
        sanitizedData[cleanKey] = sanitizeString(value).substring(0, 500);
      } else if (typeof value === "boolean") {
        sanitizedData[cleanKey] = value;
      } else if (typeof value === "number") {
        sanitizedData[cleanKey] = value;
      } else if (value && typeof value === "object" && value.arrayValue) {
        sanitizedData[cleanKey] = value;
      } else {
        sanitizedData[cleanKey] = sanitizeString(String(value));
      }
    }

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(sanitizedData).map(([k, v]) => {
            if (v && typeof v === "object" && v.arrayValue) {
              return [k.trim(), v];
            }
            return [
              k.trim(),
              typeof v === "string"
                ? { stringValue: v }
                : typeof v === "boolean"
                ? { booleanValue: v }
                : typeof v === "number"
                ? { integerValue: String(v) }
                : { stringValue: String(v) }
            ];
          })
        )
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Firestore update failed");
    }

    return res.json();
  } catch (err) {
    console.error("[Victory] firestoreUpdate FAILED:", err.message);
    throw err;
  }
}

async function firestoreGet(docPath) {
  try {
    const firebaseIdToken = await getValidFirebaseToken();

    const res = await fetch(
      `${FIRESTORE_REST_API}/projects/${firebaseConfig.projectId}/databases/(default)/documents/${docPath}`,
      {
        headers: {
          Authorization: `Bearer ${firebaseIdToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!res.ok) {
      if (res.status === 404) return null;
      const err = await res.json();
      throw new Error(err.error?.message || "Firestore get failed");
    }

    return res.json();
  } catch (err) {
    console.error("[Victory] firestoreGet FAILED:", err.message);
    throw err;
  }
}

/* =========================
   PAIRING CODE WRITE
========================= */
async function writePairingCode(pairingCode, deviceId, userEmail, uid, userName) {
  try {
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await firestoreUpdate(`devices/${deviceId}`, {
      uid: uid || "",
      deviceId: deviceId,
      userEmail: sanitizeString(userEmail) || "",
      createdAt: Date.now(),
      userName: sanitizeString(userName) || "",
      partners: { arrayValue: { values: [] } }
    });

    console.log("[Victory] device doc created:", deviceId);

    const res = await fetch(
      `${FIRESTORE_REST_API}/projects/${firebaseConfig.projectId}/databases/(default)/documents/pairingCodes/${pairingCode}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await getValidFirebaseToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            deviceId: { stringValue: deviceId },
            userEmail: { stringValue: sanitizeString(userEmail) || "" },
            userName: { stringValue: sanitizeString(userName) || "" },
            expiresAt: { integerValue: String(expiresAt) },
            used: { booleanValue: false },
            uid: { stringValue: uid || "" }
          }
        })
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Pairing code write failed");
    }

    console.log("[Victory] pairing code written to Firestore:", pairingCode);
    return true;
  } catch (err) {
    console.error("[Victory] pairing code write failed", err);
    throw err;
  }
}

/* =========================
   GET PARTNER UIDs FROM DEVICE (multiple partners)
========================= */
async function getPartnerUidsFromDevice() {
const { partnerUids } =
await chrome.storage.local.get("partnerUids");

if (
    Array.isArray(partnerUids) &&
    partnerUids.length > 0
) {

    return partnerUids;

}

  try {
    const deviceId = await getDeviceId();
    if (!deviceId) {
      console.warn("[Victory] No deviceId for partner lookup");
      return [];
    }

    const data = await firestoreGet(`devices/${deviceId}`);
    if (!data) {
      console.warn("[Victory] Device doc not found");
      return [];
    }

    const partners = data.fields?.partners?.arrayValue?.values || [];
    const partnerUids = partners
      .map(p => p.mapValue?.fields?.uid?.stringValue)
      .filter(Boolean);

    console.log("[Victory] Found partners:", partnerUids.length);

    if (partnerUids.length > 0) {
      await chrome.storage.local.set({ partnerUids });
    }

    return partnerUids;
  } catch (err) {
    console.error("[Victory] getPartnerUidsFromDevice failed:", err);
    return [];
  }
}

/* =========================
   HEARTBEAT WRITE (2-minute interval)
========================= */
async function writeHeartbeat() {
  try {

    const now = Date.now();

const { lastHeartbeat } = await chrome.storage.local.get("lastHeartbeat");

if (
    lastHeartbeat &&
    now - lastHeartbeat < HEARTBEAT_INTERVAL_MS
) {
    console.log("[Victory] Heartbeat skipped (already sent recently)");
    return;
}

if (!navigator.onLine) {

    console.log("[Victory] Offline, heartbeat skipped");

    return;

}

    const deviceId = await getDeviceId();
    const { uid } = await chrome.storage.local.get("uid");
    if (!uid) {
      console.warn("[Victory] No uid, skipping heartbeat");
      return;
    }

    console.log("[Victory] Writing heartbeat for device:", deviceId);

    const res = await fetch(
      `${FIRESTORE_REST_API}/projects/${firebaseConfig.projectId}/databases/(default)/documents/devices/${deviceId}/heartbeat/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await getValidFirebaseToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({

    fields: {

        uid: {
            stringValue: uid
        },

        lastSeen: {
            integerValue: String(now)
        }

    }

})
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Heartbeat failed");
    }
    
    await chrome.storage.local.set({
    lastHeartbeat: now
});


    heartbeatRetryCount = 0;
    console.log("[Victory] heartbeat written successfully");
  } catch (err) {
    heartbeatRetryCount++;
    console.error("[Victory] heartbeat write error:", err.message);
    
    if (heartbeatRetryCount >= MAX_HEARTBEAT_RETRIES) {
      console.error("[Victory] Max heartbeat retries reached");
    }
  }
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  writeHeartbeat();
  
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/* =========================
   BLOCK LOGGING (rate limited, privacy hashed, offline queue)
========================= */
async function logBlockedVisit(url) {
  console.log("[Victory] logBlockedVisit called with:", url);
  
  try {
    const now = Date.now();
    
    // Global rate limit
    globalLogTimestamps = globalLogTimestamps.filter(ts => now - ts < 60000);
    if (globalLogTimestamps.length >= MAX_LOGS_PER_MINUTE) {
      console.warn("[Victory] Global rate limit reached");
      return;
    }
    globalLogTimestamps.push(now);
    
    const domain = sanitizeDomain(url);
    if (!domain) {
      console.warn("[Victory] Could not sanitize domain from:", url);
      return;
    }
    
    console.log("[Victory] Sanitized domain:", domain);
    
    if (SAFE_DOMAINS.some(d => domain.includes(d))) {
      console.log("[Victory] safe domain skipped:", domain);
      return;
    }

    // Per-domain cooldown
    const last = recentLogs.get(domain);
    if (last && now - last < LOG_COOLDOWN) {
      console.log("[Victory] Domain cooldown active for:", domain);
      return;
    }
    recentLogs.set(domain, now);

    // Privacy: hash the domain
    const domainHash = await hashDomain(domain);
    console.log("[Victory] Domain hash:", domainHash);
    
    const partnerUids = await getPartnerUidsFromDevice();
    console.log("[Victory] Partner UIDs:", partnerUids);
    
    const {
      uid,
      firebaseUid,
      deviceId,
      userEmail,
      userName
    } = await chrome.storage.local.get([
      "uid",
      "firebaseUid",
      "deviceId",
      "userEmail",
      "userName"
    ]);

    console.log("[Victory] Auth state - uid:", uid, "firebaseUid:", firebaseUid, "deviceId:", deviceId);

    const effectiveUid = firebaseUid;

if (!effectiveUid) {
  console.warn("[Victory] No authenticated Firebase UID");
  return;
}
    if (!effectiveUid || !deviceId) {
      console.warn("[Victory] Missing uid or deviceId, skipping log");
      return;
    }

    const displayName = sanitizeString(userName) || (userEmail ? userEmail.split("@")[0] : "unknown");
    const first = displayName.split(" ")[0];
    const message = `${sanitizeString(first)} attempted to visit a restricted site at ${new Date().toLocaleTimeString()}`;

    const logEntry = {
      uid: effectiveUid,
      deviceId: deviceId,
      partnerUid: "",
      domainHash: domainHash,
      domain: domain.substring(0, 100),
      userEmail: sanitizeString(userEmail) || "",
      userName: displayName,
      message: message,
      createdAt: new Date().toISOString(),
      timestamp: now
    };

    console.log("[Victory] Prepared log entry with fields:", Object.keys(logEntry));

    if (partnerUids.length === 0) {
      console.log("[Victory] No partners, writing single log");
      try {
        await addToOfflineQueue(logEntry);

processOfflineQueue();
        console.log("[Victory] Single log write complete");
      } catch (err) {
        console.log("[Victory] Single log failed (may be queued):", err.message);
      }
    } else {
      console.log("[Victory] Writing logs for", partnerUids.length, "partners");
      for (const partnerUid of partnerUids) {
        const partnerLog = { ...logEntry, partnerUid };
        try {
          await addToOfflineQueue(partnerLog);

processOfflineQueue();
          console.log("[Victory] Partner log written for:", partnerUid);
        } catch (err) {
          console.log("[Victory] Partner log failed (may be queued):", err.message);
        }
      }
    }

    console.log("[Victory] logBlockedVisit complete");
  } catch (err) {
    console.error("[Victory] logBlockedVisit outer catch:", err);
  }
}

/* =========================
   MESSAGE LISTENER
========================= */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[Victory] Message received:", msg.type, "from:", sender.tab?.url || "internal");
  
  if (msg.type === "LOGIN") {
    (async () => {
      try {
        const googleToken = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: true }, (t) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(t);
          });
        });

        const authData = await exchangeGoogleTokenForFirebase(googleToken);

        const tokenExpiry = Date.now() + (parseInt(authData.expiresIn) * 1000);
        const { displayName } =
    await chrome.storage.local.get("displayName");

const finalName =
    displayName?.trim() || authData.displayName;
    
        await chrome.storage.local.set({
          uid: authData.localId,
          firebaseUid: authData.localId,
          userEmail: authData.email,
          userName: finalName,
          firebaseIdToken: authData.idToken,
          firebaseRefreshToken: authData.refreshToken,
          firebaseTokenExpiry: tokenExpiry,
          userPhotoUrl: authData.photoUrl
        });

        const deviceId = await getDeviceId();
        const pairingCode = crypto.randomUUID().slice(0, 8).toUpperCase();

        await writePairingCode(
          pairingCode,
          deviceId,
          authData.email,
          authData.localId,
          finalName
        );

        startHeartbeat();
        startOfflineRetryLoop();

        sendResponse({
          ok: true,
          pairingCode,
          deviceId,
          uid: authData.localId,
          email: authData.email
        });
      } catch (e) {
    console.error("[Victory] login error:", e);
    console.error("[Victory] login error:", e);
console.dir(e);
console.log("message:", e?.message);
console.log("name:", e?.name);
console.log("stack:", e?.stack);

    sendResponse({
        ok: false,
        error: e?.message || JSON.stringify(e)
    });
}
    })();

    return true;
  }

  if (msg.type === "STORE_PARTNER") {
    (async () => {
      try {
        await chrome.storage.local.set({
          partnerUid: msg.partnerUid,
          partnerEmail: msg.partnerEmail
        });

        const deviceId = await getDeviceId();
        const deviceData = await firestoreGet(`devices/${deviceId}`);
        
        let partners = [];
        if (deviceData && deviceData.fields?.partners?.arrayValue?.values) {
          partners = deviceData.fields.partners.arrayValue.values;
        }
        
        const exists = partners.some(p => 
          p.mapValue?.fields?.uid?.stringValue === msg.partnerUid
        );
        
        if (!exists && msg.partnerUid) {
          partners.push({
            mapValue: {
              fields: {
                uid: { stringValue: msg.partnerUid },
                email: { stringValue: sanitizeString(msg.partnerEmail) || "" },
                linkedAt: { integerValue: String(Date.now()) }
              }
            }
          });
          
          await firestoreUpdate(`devices/${deviceId}`, {
            partners: { arrayValue: { values: partners } }
          });
          const { partnerUids = [] } =
    await chrome.storage.local.get("partnerUids");

if (!partnerUids.includes(msg.partnerUid)) {

    partnerUids.push(msg.partnerUid);

    await chrome.storage.local.set({
        partnerUids
    });

}

        }

        console.log("[Victory] partner stored:", msg.partnerUid);
        sendResponse({ ok: true });
      } catch (e) {
        console.error("[Victory] store partner failed:", e);
        sendResponse({ ok: false, error: sanitizeString(e.message) });
      }
    })();
    return true;
  }

  if (msg.type === "LOGOUT") {
    (async () => {
      try {
        // Write disabled message before logging out
        await writeDisabledMessage();
        
        stopHeartbeat();
        if (offlineRetryTimer) clearInterval(offlineRetryTimer);
        
        await chrome.storage.local.remove([
          "uid",
          "firebaseUid",
          "userEmail",
          "userName",
          "firebaseIdToken",
          "firebaseRefreshToken",
          "firebaseTokenExpiry",
          "userPhotoUrl",
          "partnerUid",
          "partnerEmail",
          "partnerUids"
        ]);

        console.log("[Victory] logged out successfully");
        sendResponse({ ok: true });
      } catch (e) {
        console.error("[Victory] logout error:", e);
        sendResponse({ ok: false, error: sanitizeString(e.message) });
      }
    })();

    return true;
  }

  if (msg.type === "LOG_BLOCKED_VISIT") {
    console.log("[Victory] Handling LOG_BLOCKED_VISIT for domain:", msg.domain);
    logBlockedVisit(msg.domain)
      .then(() => {
        console.log("[Victory] LOG_BLOCKED_VISIT handler complete");
        sendResponse({ ok: true });
      })
      .catch((e) => {
        console.error("[Victory] LOG_BLOCKED_VISIT handler error:", e);
        sendResponse({ ok: false, error: sanitizeString(e.message) });
      });

    return true;
  }
  
  if (msg.type === "GET_OFFLINE_QUEUE_STATUS") {
    (async () => {
      const queue = await getOfflineQueue();
      sendResponse({ ok: true, count: queue.length });
    })();
    return true;
  }
});

/* =========================
   DIRECT DNR LOGGING (Backup method)
   Uses chrome.declarativeNetRequest.onRuleMatchedDebug if available
========================= */
if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    console.log("[Victory] DNR rule matched:", info.request.url);
    logBlockedVisit(info.request.url);
  });
}
// Add this function to background.js
async function debugToken() {
  const token = await getValidFirebaseToken();
  
  // Decode JWT payload (base64)
  const base64Payload = token.split('.')[1];
  const payload = JSON.parse(atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/')));
  
  console.log("[Victory] JWT payload:", payload);
  console.log("[Victory] JWT sub (uid):", payload.sub);
  console.log("[Victory] JWT user_id:", payload.user_id);
  console.log("[Victory] Stored uid:", (await chrome.storage.local.get("uid")).uid);
  
  return payload.sub || payload.user_id;
}


/* =========================
   OPEN POPUP PAGE ON INSTALL
========================= */

chrome.runtime.onInstalled.addListener((details) => {

  // Only on first install
  if (details.reason !== "install") return;

  chrome.tabs.create({
    url: chrome.runtime.getURL(
      "popup/popup.html"
    )
  });

});

/* =========================
   ENCOURAGEMENT NOTIFICATIONS
========================= */

function pickRandomMessage() {
    const index = Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length);
    return ENCOURAGEMENT_MESSAGES[index];
}

async function showEncouragement() {

    const { uid } = await chrome.storage.local.get("uid");

    if (!uid)
        return;

    const message = pickRandomMessage();

    chrome.notifications.create({
        type: "basic",
        iconUrl: "/Img/icons/icon-192x192.png",
        title: "Victory",
        message
    });

}

function startNotificationScheduler() {

    chrome.alarms.create(

        ENCOURAGEMENT_ALARM,

        {

            delayInMinutes: ENCOURAGEMENT_INTERVAL_MINUTES,

            periodInMinutes: ENCOURAGEMENT_INTERVAL_MINUTES

        }

    );

    console.log("[Victory] Encouragement scheduler started");
chrome.alarms.onAlarm.addListener((alarm) => {

    if (alarm.name !== ENCOURAGEMENT_ALARM)
        return;

    showEncouragement();

});
}
// Call this in console: debugToken()
/* =========================
   DISABLED MESSAGE WRITE
========================= */
async function writeDisabledMessage() {
  try {
    const { uid, deviceId, userName, userEmail } = await chrome.storage.local.get([
      "uid",
      "deviceId",
      "userName",
      "userEmail"
    ]);

    if (!uid || !deviceId) {
      console.warn("[Victory] Missing uid or deviceId for disabled message");
      return;
    }

    const displayName = sanitizeString(userName) || (userEmail ? userEmail.split("@")[0] : "User");
    const message = `${displayName} disabled the Victory Protection service.`;

    const partnerUids = await getPartnerUidsFromDevice();
    console.log("[Victory] Writing disabled message to", partnerUids.length, "partners");

    const logEntry = {
      uid: uid,
      deviceId: deviceId,
      partnerUid: "",
      domainHash: "disabled",
      domain: "extension_disabled",
      userEmail: sanitizeString(userEmail) || "",
      userName: displayName,
      message: message,
      createdAt: new Date().toISOString(),
      timestamp: Date.now()
    };

    if (partnerUids.length === 0) {
      console.log("[Victory] No partners, writing single disabled message");
      try {
        await addToOfflineQueue(logEntry);
        processOfflineQueue();
        console.log("[Victory] Disabled message written");
      } catch (err) {
        console.log("[Victory] Disabled message failed (may be queued):", err.message);
      }
    } else {
      console.log("[Victory] Writing disabled messages for", partnerUids.length, "partners");
      for (const partnerUid of partnerUids) {
        const partnerLog = { ...logEntry, partnerUid };
        try {
          await addToOfflineQueue(partnerLog);
          processOfflineQueue();
          console.log("[Victory] Disabled message written for:", partnerUid);
        } catch (err) {
          console.log("[Victory] Disabled message failed (may be queued):", err.message);
        }
      }
    }
  } catch (err) {
    console.error("[Victory] writeDisabledMessage error:", err);
  }
}

/* =========================
   EXTENSION DISABLE DETECTION
========================= */
chrome.runtime.onSuspend.addListener(async () => {
  console.log("[Victory] Extension being suspended/disabled");
  try {
    await writeDisabledMessage();
  } catch (err) {
    console.error("[Victory] Failed to write disabled message on suspend:", err);
  }
});

/* =========================
   INIT
========================= */
loadBlockedSites();

startOfflineRetryLoop();

startNotificationScheduler();

console.log("[Victory] background ready");