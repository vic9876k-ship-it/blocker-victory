document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     1. PARSE BLOCKED URL
  ========================= */
  const params = new URLSearchParams(window.location.search);
  const blockedUrl = params.get("blockedUrl") || "unknown";

  let displayDomain = blockedUrl;
  try {
    displayDomain = new URL(blockedUrl).hostname.replace(/^www\./, "");
  } catch (err) {
    console.warn("[Victory] Failed to parse URL:", blockedUrl);
  }

  const domainEl = document.getElementById("domain");
  if (domainEl) {
    domainEl.textContent = displayDomain;
  }

  /* =========================
     2. LOG TO BACKGROUND
  ========================= */
  try {
    chrome.runtime.sendMessage(
      {
        type: "LOG_BLOCKED_VISIT",
        domain: displayDomain,
        timestamp: Date.now()
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Victory] Log failed:", chrome.runtime.lastError.message);
          return;
        }
        console.log("[Victory] Log response:", response);
      }
    );
  } catch (e) {
    console.error("[Victory] Failed to log blocked visit:", e);
  }

  /* =========================
     3. LOCAL TRIGGER ENGINE
  ========================= */
  function logTrigger() {
    const triggers = JSON.parse(localStorage.getItem('victory_triggers') || '[]');
    triggers.push(Date.now());
    if (triggers.length > 100) triggers.shift();
    localStorage.setItem('victory_triggers', JSON.stringify(triggers));
  }

  function getTriggers() {
    return JSON.parse(localStorage.getItem('victory_triggers') || '[]');
  }

  function hasRecentBypass() {
    const last = localStorage.getItem('victory_last_bypass');
    if (!last) return false;
    return (Date.now() - parseInt(last)) < 24 * 60 * 60 * 1000;
  }

  function setBypassFlag() {
    localStorage.setItem('victory_last_bypass', Date.now().toString());
  }

  function getRiskScore() {
    const hour = new Date().getHours();
    const triggers = getTriggers();
    const dayAgo = Date.now() - 86400000;
    const recent24h = triggers.filter(t => t > dayAgo).length;

    let score = 0;
    if (hour >= 0 && hour <= 5) score += 0.35;
    if (hour >= 22) score += 0.20;
    if (recent24h > 3) score += 0.25;
    if (recent24h > 6) score += 0.15;

    return Math.min(score, 1.0);
  }

  logTrigger();

  /* =========================
     4. SCRIPTURE & COPY BANK
  ========================= */
  const scriptures = {
    comfort: [
      "Philippians 4:13 — I can do all things through Christ who strengthens me.",
      "Isaiah 41:10 — Fear not, for I am with you; be not dismayed, for I am your God.",
      "2 Timothy 1:7 — God gave us a spirit not of fear but of power and love and self-control.",
      "Romans 8:1 — There is therefore now no condemnation for those who are in Christ Jesus."
    ],
    bridge: [
      "Psalm 46:10 — Be still, and know that I am God.",
      "Exodus 14:14 — The Lord will fight for you; you need only to be still.",
      "Psalm 23:2 — He leads me beside still waters. He restores my soul."
    ],
    firm: [
      "Proverbs 27:6 — Faithful are the wounds of a friend.",
      "Galatians 6:7 — Do not be deceived: God is not mocked, for whatever one sows, that will he also reap.",
      "James 1:14 — Each person is tempted when he is lured and enticed by his own desire."
    ]
  };

  function pickScripture(mode) {
    const list = scriptures[mode] || scriptures.comfort;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* =========================
     5. MODE RENDERERS
  ========================= */
  const interventionArea = document.getElementById('intervention-area');
  const encouragementBox = document.getElementById('encouragement-box');
  const bridgeOverlay = document.getElementById('bridge-overlay');
  const bridgeScripture = document.getElementById('bridge-scripture');
  const bridgeTimer = document.getElementById('bridge-timer');

  function renderComfort() {
    encouragementBox.innerHTML = `
      <div style="margin-bottom:6px;">🕊️ ${pickScripture('comfort')}</div>
      <div style="opacity:0.85;">This moment will pass. What you feed grows. Feed your spirit.</div>
    `;

    interventionArea.innerHTML = `
      <button class="victory-btn btn-primary" id="btn-surf">🌊 Ride the Wave (90s)</button>
      <button class="victory-btn btn-secondary" id="btn-thought">✍️ Name What I'm Running From</button>
      <button class="victory-btn btn-calm" id="btn-breathe">🫁 Just Breathe</button>
    `;

    document.getElementById('btn-surf').addEventListener('click', startSurf);
    document.getElementById('btn-thought').addEventListener('click', startThoughtCapture);
    document.getElementById('btn-breathe').addEventListener('click', startBreathe);
  }

  function renderBridge() {
    // Show overlay on top of container
    bridgeScripture.textContent = pickScripture('bridge');
    bridgeOverlay.classList.remove('hidden');

    let seconds = 90;
    const interval = setInterval(() => {
      seconds--;
      if (bridgeTimer) bridgeTimer.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(interval);
        bridgeOverlay.classList.add('hidden');
        // After bridge, show comfort options
        renderComfort();
      }
    }, 1000);
  }

  function renderFirm() {
    // Darken the whole page
    document.body.style.background = 'radial-gradient(circle at top, #1a0505, #0a0202)';
    encouragementBox.style.background = 'rgba(239,68,68,0.08)';
    encouragementBox.style.borderColor = 'rgba(239,68,68,0.25)';
    encouragementBox.style.color = '#fca5a5';
    encouragementBox.innerHTML = `
      <div style="font-weight:bold; margin-bottom:6px;">⚠️ You have been here before.</div>
      <div style="opacity:0.9;">${pickScripture('firm')}</div>
    `;

    interventionArea.innerHTML = `
      <div style="padding:14px; border-radius:10px; background:rgba(0,0,0,0.25); margin-top:5px;">
        <p style="color:#fca5a5; font-size:14px; margin-bottom:12px; font-style:italic;">
          "You uninstalled the wall. We both know why. The question is not whether you can outsmart a browser extension. The question is whether you want to spend your life outsmarting yourself."
        </p>
        <button class="victory-btn btn-danger" id="btn-return">🚪 I Need the Door Back</button>
        <button class="victory-btn btn-ghost-red" id="btn-thought-firm">Name What I'm Running From</button>
      </div>
    `;

    document.getElementById('btn-return').addEventListener('click', () => {
      localStorage.removeItem('victory_last_bypass');
      location.reload();
    });
    document.getElementById('btn-thought-firm').addEventListener('click', startThoughtCapture);
  }

  /* =========================
     6. INTERACTIVE TOOLS
  ========================= */

  // --- BREATHE ---
  function startBreathe() {
    interventionArea.innerHTML = `
      <div style="padding:10px;">
        <div class="breath-circle" style="margin-bottom:15px;"></div>
        <p style="color:#a9c4ff; font-size:13px; margin-bottom:10px;">Breathe with the circle. In 4, hold 7, out 8.</p>
        <p class="scripture-tag">Psalm 131:2 — I have calmed and quieted my soul.</p>
        <button class="victory-btn btn-secondary" onclick="location.reload()" style="margin-top:10px;">I'm Calmer Now</button>
      </div>
    `;
  }

  // --- THOUGHT CAPTURE ---
  function startThoughtCapture() {
    interventionArea.innerHTML = `
      <div style="padding:5px;">
        <p style="color:#a9c4ff; font-size:13px; margin-bottom:6px;">2 Corinthians 10:5 — Take every thought captive to obey Christ.</p>
        <p style="color:#d6e2ff; font-size:13px; margin-bottom:8px;">What was the thought right before you clicked?</p>
        <textarea id="thought-input" rows="3" placeholder="I felt invisible... I felt angry... I was bored..."></textarea>
        <div style="display:flex; gap:8px; margin-top:10px; justify-content:center;">
          <button class="victory-btn btn-primary" id="btn-save-thought" style="flex:1;">Save It</button>
          <button class="victory-btn btn-secondary" onclick="location.reload()" style="flex:1;">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-thought').addEventListener('click', () => {
      const text = document.getElementById('thought-input').value.trim();
      if (!text) return;

      const thoughts = JSON.parse(localStorage.getItem('victory_thoughts') || '[]');
      thoughts.push({ text, time: Date.now() });
      localStorage.setItem('victory_thoughts', JSON.stringify(thoughts.slice(-50)));

      interventionArea.innerHTML = `
        <div style="padding:15px; color:#dfffe8;">
          <p style="font-size:15px;">✓ Noted. The wave is named now.</p>
          <p class="scripture-tag">John 8:32 — The truth will set you free.</p>
          <button class="victory-btn btn-secondary" onclick="location.reload()" style="margin-top:10px;">Close</button>
        </div>
      `;
    });
  }

  // --- URGE SURF ---
  function startSurf() {
    interventionArea.innerHTML = `
      <div style="padding:5px;">
        <h3 style="color:#60a5fa; margin-bottom:4px;">🌊 Urge Surf</h3>
        <p style="color:#a9c4ff; font-size:12px; margin-bottom:8px;">Rate your urge every 15 seconds. Watch it become a wave.</p>
        <svg id="surf-svg" viewBox="0 0 300 130"></svg>
        <div id="surf-controls">
          <p style="color:#d6e2ff; margin-bottom:8px;">Intensity: <span id="current-intensity" style="color:#60a5fa; font-weight:bold;">-</span>/10</p>
          <div id="surf-buttons" style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<button class="surf-num-btn" data-val="${n}">${n}</button>`
            ).join('')}
          </div>
          <p id="surf-status" style="color:#a9c4ff; font-size:11px; margin-top:8px;">Press a number to begin</p>
        </div>
        <div id="surf-result" class="hidden" style="padding:8px;"></div>
      </div>
    `;

    const points = [];
    let readingCount = 0;
    const maxReadings = 6;
    let isWaiting = false;

    function drawGraph() {
      const svg = document.getElementById('surf-svg');
      if (!svg || points.length < 1) return;
      const max = 10;
      const w = 300, h = 130;
      const pad = 15;
      const stepX = (w - pad * 2) / (maxReadings - 1);

      let d = `M ${pad} ${h - pad - (points[0]/max)*(h - pad*2)}`;
      points.forEach((p, i) => {
        d += ` L ${pad + i * stepX} ${h - pad - (p/max)*(h - pad*2)}`;
      });

      svg.innerHTML = `
        <line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        <path d="${d}" stroke="#60a5fa" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map((p, i) =>
          `<circle cx="${pad + i * stepX}" cy="${h - pad - (p/max)*(h - pad*2)}" r="4" fill="#60a5fa"/>`
        ).join('')}
      `;
    }

    function handleRating(val) {
      if (isWaiting) return;
      points.push(val);
      readingCount++;
      document.getElementById('current-intensity').textContent = val;
      drawGraph();

      if (readingCount >= maxReadings) {
        finishSurf();
        return;
      }

      // Lock buttons for ~12s to enforce pacing
      isWaiting = true;
      const buttons = document.querySelectorAll('.surf-num-btn');
      buttons.forEach(b => b.disabled = true);
      document.getElementById('surf-status').textContent = `Reading ${readingCount} of ${maxReadings}. Next unlocks in 12s...`;

      setTimeout(() => {
        isWaiting = false;
        buttons.forEach(b => b.disabled = false);
        document.getElementById('surf-status').textContent = 'Rate your current urge';
      }, 12000);
    }

    document.querySelectorAll('.surf-num-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handleRating(parseInt(e.target.dataset.val)));
    });
  }

  function finishSurf() {
    const controls = document.getElementById('surf-controls');
    const result = document.getElementById('surf-result');
    if (controls) controls.classList.add('hidden');

    const start = points.length > 0 ? points[0] : 0;
    const end = points.length > 0 ? points[points.length - 1] : 0;
    const drop = start - end;

    if (result) {
      result.classList.remove('hidden');
      result.innerHTML = `
        <p style="font-size:16px; color:#dfffe8; margin-bottom:6px;">
          ${drop > 0 ? '↘️' : '↗️'} Your urge went from ${start} to ${end}.
        </p>
        <p style="color:#a9c4ff; font-size:13px; margin-bottom:8px;">
          ${drop > 0
            ? 'It is a wave, not a command. It peaks, then it falls.'
            : 'Even when it stays high, you stayed with it. That is strength.'}
        </p>
        <p class="scripture-tag">Psalm 30:5 — Weeping may tarry for the night, but joy comes with the morning.</p>
        <button class="victory-btn btn-secondary" onclick="location.reload()" style="margin-top:10px;">Close</button>
      `;
    }
  }

  /* =========================
     7. ROUTER: PICK MODE
  ========================= */
  if (hasRecentBypass()) {
    renderFirm();
  } else {
    const score = getRiskScore();
    if (score > 0.65) {
      renderBridge();
    } else {
      renderComfort();
    }
  }

  /* =========================
     8. BYPASS DETECTION
  ========================= */
  window.addEventListener('beforeunload', () => {
    const triggers = getTriggers();
    const last = triggers[triggers.length - 1];
    if (last && (Date.now() - last) < 8000) {
      setBypassFlag();
    }
  });

  /* =========================
     9. GO BACK (ORIGINAL)
  ========================= */
  const goBackBtn = document.getElementById("goBackBtn");
  if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        try {
          chrome.runtime.sendMessage({ type: "CLOSE_TAB" });
        } catch (e) {
          window.close();
        }
      }
    });
  }

});