/**
 * GAME BOT Mini App shell — Profil / O‘yin / Reyting
 */

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Bot API 7.7+: block pull-down sheet close; exit via Telegram header X only
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#11111d");
    tg.setBackgroundColor("#11111d");
  } catch {
    /* older clients */
  }
}

const els = {
  views: document.getElementById("views"),
  connDot: document.getElementById("connDot"),
  nickDisplay: document.getElementById("nickDisplay"),
  avatarImg: document.getElementById("avatarImg"),
  avatarFallback: document.getElementById("avatarFallback"),
  avatarBtn: document.getElementById("avatarBtn"),
  avatarInput: document.getElementById("avatarInput"),
  editNickBtn: document.getElementById("editNickBtn"),
  nickEditor: document.getElementById("nickEditor"),
  nickInput: document.getElementById("nickInput"),
  nickCancel: document.getElementById("nickCancel"),
  nickSave: document.getElementById("nickSave"),
  nickStatus: document.getElementById("nickStatus"),
  profileStatus: document.getElementById("profileStatus"),
  statPoints: document.getElementById("statPoints"),
  statRating: document.getElementById("statRating"),
  statGames: document.getElementById("statGames"),
  offlineBtn: document.getElementById("offlineBtn"),
  local2pBtn: document.getElementById("local2pBtn"),
  randomBtn: document.getElementById("randomBtn"),
  onlineList: document.getElementById("onlineList"),
  onlineEmpty: document.getElementById("onlineEmpty"),
  onlineCount: document.getElementById("onlineCount"),
  inviteBanner: document.getElementById("inviteBanner"),
  inviteText: document.getElementById("inviteText"),
  inviteAccept: document.getElementById("inviteAccept"),
  inviteDecline: document.getElementById("inviteDecline"),
  leaderboard: document.getElementById("leaderboard"),
  boardEmpty: document.getElementById("boardEmpty"),
  boardStatus: document.getElementById("boardStatus"),
};

/** @type {any} */
let me = null;
/** @type {string|null} */
let pendingInviteId = null;
let presenceWs = null;
let heartbeatTimer = null;
let pingTimer = null;
let reconnectTimer = null;
let presenceReady = false;
let reconnectAttempt = 0;
let connectingPresence = false;

const EMPTY_DISCONNECTED =
  "Hozircha onlayn o‘yinchi yo‘q";
const EMPTY_ALONE =
  "Siz onlaynsiz — boshqa o‘yinchi yo‘q";

function authPayload() {
  const initData = tg?.initData || "";
  if (initData) return { initData };

  // telegram-web-app.js defines WebApp even in a normal browser, but only a
  // real Telegram session has initDataUnsafe.user. Wait only in that case.
  const inTelegram = Boolean(tg?.initDataUnsafe?.user?.id);
  if (inTelegram) return null;

  // Local browser / missing Telegram context → dev identity (ALLOW_DEV_SCORE_SUBMIT).
  let id = Number(sessionStorage.getItem("gb_dev_id") || 0);
  if (!id) {
    id = Date.now() % 1_000_000;
    sessionStorage.setItem("gb_dev_id", String(id));
  }
  return { devTelegramId: id, displayName: `Dev ${id}` };
}

/**
 * Wait briefly for Telegram initData (some WebViews populate it after ready()).
 * @param {number} [maxMs]
 */
async function waitForAuthPayload(maxMs = 2500) {
  const started = Date.now();
  let payload = authPayload();
  while (!payload && Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, 100));
    payload = authPayload();
  }
  return payload;
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === name);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.getAttribute("data-view") === name);
  });
  if (name === "oyin") {
    void presencePing();
    ensurePresenceConnected();
  }
  if (name === "reyting") void loadLeaderboard();
  try {
    history.replaceState(null, "", `#${name}`);
  } catch {
    /* ignore */
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    if (tab) setTab(tab);
  });
});

const hash = (location.hash || "").replace("#", "");
if (hash === "oyin" || hash === "reyting" || hash === "profil") {
  setTab(hash);
}

function setConnDot(on) {
  els.connDot?.classList.toggle("on", Boolean(on));
}

function setEmptyMessage(text) {
  if (!els.onlineEmpty) return;
  let label = els.onlineEmpty.querySelector("[data-empty-label]");
  if (!label) {
    // Preserve icon; replace trailing text nodes / wrap label.
    label = document.createElement("span");
    label.setAttribute("data-empty-label", "1");
    // Clear text nodes after the icon.
    [...els.onlineEmpty.childNodes].forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.remove();
    });
    els.onlineEmpty.appendChild(document.createTextNode("\n            "));
    els.onlineEmpty.appendChild(label);
  }
  label.textContent = text;
}

function renderProfile(user) {
  me = user;
  const name = user.publicName || user.nickname || user.displayName || "O‘yinchi";
  if (els.nickDisplay) els.nickDisplay.textContent = name;
  if (els.statPoints) els.statPoints.textContent = String(user.totalPoints ?? 0);
  if (els.statRating) els.statRating.textContent = String(user.rating ?? 1000);
  if (els.statGames) els.statGames.textContent = String(user.gamesPlayed ?? 0);
  if (!els.avatarImg || !els.avatarFallback) return;
  if (user.avatarUrl) {
    els.avatarImg.src = user.avatarUrl;
    els.avatarImg.classList.remove("hidden");
    els.avatarFallback.classList.add("hidden");
  } else {
    els.avatarImg.classList.add("hidden");
    els.avatarFallback.classList.remove("hidden");
  }
}

async function bootstrapMe() {
  if (els.profileStatus) els.profileStatus.textContent = "Yuklanmoqda…";
  try {
    const auth = await waitForAuthPayload();
    if (!auth) {
      throw new Error("Telegram initData yo‘q — Mini Appni bot orqali oching");
    }
    const res = await fetch("/api/v1/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Profil API JSON emas (HTML qaytdi)");
    }
    if (!res.ok) throw new Error(data.error || "Profil ochilmadi");
    renderProfile(data.user);
    if (els.profileStatus) {
      els.profileStatus.textContent = "";
      els.profileStatus.classList.remove("error");
    }
    return true;
  } catch (err) {
    if (els.profileStatus) {
      els.profileStatus.textContent =
        err instanceof Error ? err.message : "Profil ochilmadi";
      els.profileStatus.classList.add("error");
    }
    return false;
  }
}

els.editNickBtn?.addEventListener("click", () => {
  els.nickEditor?.classList.remove("hidden");
  if (els.nickInput) {
    els.nickInput.value = me?.nickname || me?.publicName || "";
    els.nickInput.focus();
  }
});

els.nickCancel?.addEventListener("click", () => {
  els.nickEditor?.classList.add("hidden");
  if (els.nickStatus) els.nickStatus.textContent = "";
});

els.nickSave?.addEventListener("click", async () => {
  if (!els.nickStatus || !els.nickInput) return;
  els.nickStatus.textContent = "Saqlanmoqda…";
  els.nickStatus.classList.remove("error");
  try {
    const auth = await waitForAuthPayload();
    if (!auth) throw new Error("Auth yo‘q");
    const res = await fetch("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        nickname: els.nickInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Saqlash xato");
    renderProfile(data.user);
    els.nickEditor?.classList.add("hidden");
    els.nickStatus.textContent = "";
    presenceSend({ type: "refresh" });
    void presencePing();
  } catch (err) {
    els.nickStatus.textContent =
      err instanceof Error ? err.message : "Saqlash xato";
    els.nickStatus.classList.add("error");
  }
});

els.avatarBtn?.addEventListener("click", () => els.avatarInput?.click());

els.avatarInput?.addEventListener("change", async () => {
  const file = els.avatarInput.files?.[0];
  if (!file) return;
  if (file.size > 700_000) {
    if (els.profileStatus) {
      els.profileStatus.textContent = "Rasm juda katta (max ~500KB)";
      els.profileStatus.classList.add("error");
    }
    return;
  }
  if (els.profileStatus) {
    els.profileStatus.classList.remove("error");
    els.profileStatus.textContent = "Rasm yuklanmoqda…";
  }
  try {
    const auth = await waitForAuthPayload();
    if (!auth) throw new Error("Auth yo‘q");
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/v1/me/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        imageBase64: dataUrl,
        mime: file.type,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Yuklash xato");
    renderProfile(data.user);
    if (els.profileStatus) els.profileStatus.textContent = "Rasm yangilandi";
    presenceSend({ type: "refresh" });
    void presencePing();
  } catch (err) {
    if (els.profileStatus) {
      els.profileStatus.textContent =
        err instanceof Error ? err.message : "Rasm yuklanmadi";
      els.profileStatus.classList.add("error");
    }
  } finally {
    if (els.avatarInput) els.avatarInput.value = "";
  }
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Fayl o‘qilmadi"));
    reader.readAsDataURL(file);
  });
}

function goPlay(mode, extra = {}) {
  const params = new URLSearchParams({ mode, from: "app", ...extra });
  location.href = `/air-hockey/?${params.toString()}`;
}

els.offlineBtn?.addEventListener("click", () => goPlay("ai"));
els.local2pBtn?.addEventListener("click", () => goPlay("local"));
els.randomBtn?.addEventListener("click", () => goPlay("online"));

/**
 * @param {any[]} users peers (excludes self)
 * @param {{ onlineCount?: number, connected?: boolean }} [meta]
 */
function renderOnline(users, meta = {}) {
  const list = Array.isArray(users) ? users : [];
  const myId = me?.telegramId;
  const peers = list.filter(
    (u) => myId == null || Number(u.telegramId) !== Number(myId),
  );
  const connected = meta.connected ?? presenceReady;
  const total =
    typeof meta.onlineCount === "number"
      ? meta.onlineCount
      : connected
        ? peers.length + 1
        : peers.length;

  if (els.onlineCount) els.onlineCount.textContent = String(total);
  if (els.onlineList) els.onlineList.innerHTML = "";

  if (!peers.length) {
    setEmptyMessage(connected ? EMPTY_ALONE : EMPTY_DISCONNECTED);
    els.onlineEmpty?.classList.remove("hidden");
    return;
  }

  els.onlineEmpty?.classList.add("hidden");
  for (const u of peers) {
    const li = document.createElement("li");
    const av = document.createElement("div");
    av.className = "mini-av";
    if (u.avatarUrl) {
      const img = document.createElement("img");
      img.src = u.avatarUrl;
      img.alt = "";
      av.appendChild(img);
    } else {
      av.textContent = (u.displayName?.[0] || "?").toUpperCase();
    }
    const metaEl = document.createElement("div");
    metaEl.innerHTML = `<p class="u-name"></p><p class="u-meta"></p>`;
    metaEl.querySelector(".u-name").textContent = u.displayName;
    metaEl.querySelector(".u-meta").textContent =
      `Reyting · ${u.rating ?? "—"}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "play-btn";
    btn.textContent = "Chaqirish";
    btn.addEventListener("click", () => {
      presenceSend({ type: "invite", toTelegramId: u.telegramId });
      btn.textContent = "…";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = "Chaqirish";
        btn.disabled = false;
      }, 2500);
    });
    li.append(av, metaEl, btn);
    els.onlineList?.appendChild(li);
  }
}

function presenceUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/presence`;
}

function presenceSend(msg) {
  if (presenceWs?.readyState === WebSocket.OPEN) {
    presenceWs.send(JSON.stringify(msg));
  }
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(10_000, 1500 * Math.max(1, reconnectAttempt));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectPresence();
  }, delay);
}

function ensurePresenceConnected() {
  if (
    presenceWs &&
    (presenceWs.readyState === WebSocket.OPEN ||
      presenceWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  connectPresence();
}

function connectPresence() {
  if (connectingPresence) return;
  connectingPresence = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (presenceWs) {
    try {
      presenceWs.onclose = null;
      presenceWs.onmessage = null;
      presenceWs.onerror = null;
      presenceWs.close();
    } catch {
      /* ignore */
    }
    presenceWs = null;
  }

  let ws;
  try {
    ws = new WebSocket(presenceUrl());
  } catch {
    connectingPresence = false;
    presenceReady = false;
    setConnDot(false);
    reconnectAttempt += 1;
    scheduleReconnect();
    return;
  }
  presenceWs = ws;
  connectingPresence = false;

  ws.onopen = () => {
    void (async () => {
      const auth = await waitForAuthPayload();
      if (presenceWs !== ws) return;
      if (!auth) {
        presenceReady = false;
        setConnDot(false);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }
      // Do not light the dot until welcome — open ≠ authenticated.
      try {
        ws.send(JSON.stringify({ type: "hello", ...auth }));
      } catch {
        /* ignore */
      }
    })();
  };

  ws.onclose = () => {
    if (presenceWs === ws) presenceWs = null;
    clearHeartbeat();
    presenceReady = false;
    setConnDot(false);
    reconnectAttempt += 1;
    scheduleReconnect();
  };

  ws.onerror = () => {
    /* onclose handles retry */
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "welcome":
        presenceReady = true;
        reconnectAttempt = 0;
        setConnDot(true);
        clearHeartbeat();
        heartbeatTimer = setInterval(() => {
          presenceSend({ type: "heartbeat" });
        }, 12_000);
        renderOnline(msg.users || [], {
          onlineCount: msg.onlineCount,
          connected: true,
        });
        break;
      case "online":
        presenceReady = true;
        setConnDot(true);
        renderOnline(msg.users || [], {
          onlineCount: msg.onlineCount,
          connected: true,
        });
        break;
      case "error":
        presenceReady = false;
        setConnDot(false);
        setEmptyMessage(msg.message || EMPTY_DISCONNECTED);
        els.onlineEmpty?.classList.remove("hidden");
        break;
      case "invite":
        pendingInviteId = msg.inviteId;
        if (els.inviteText) {
          els.inviteText.textContent = `${msg.from?.displayName || "O‘yinchi"} sizni Air Hockeyga chaqirdi`;
        }
        els.inviteBanner?.classList.remove("hidden");
        setTab("oyin");
        break;
      case "invite_accepted":
        if (msg.playUrl) location.href = msg.playUrl;
        break;
      case "invite_declined":
      case "invite_declined_ack":
        els.inviteBanner?.classList.add("hidden");
        pendingInviteId = null;
        break;
      case "invite_error":
        if (els.profileStatus) {
          els.profileStatus.textContent =
            msg.message || "Chaqiriq amalga oshmadi";
        }
        break;
      default:
        break;
    }
  };
}

/** HTTP presence keepalive + list refresh (works even if WS is down). */
async function presencePing() {
  try {
    const auth = await waitForAuthPayload(800);
    if (!auth) return;
    const res = await fetch("/api/v1/presence/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!res.ok) return;
    // HTTP ping proves we are in the registry even without WS welcome yet.
    if (!presenceReady) setConnDot(true);
    renderOnline(data.users || [], {
      onlineCount: data.onlineCount,
      connected: true,
    });
  } catch {
    /* ignore transient network errors */
  }
}

function startPresencePingLoop() {
  if (pingTimer) clearInterval(pingTimer);
  void presencePing();
  pingTimer = setInterval(() => {
    void presencePing();
  }, 10_000);
}

els.inviteAccept?.addEventListener("click", () => {
  if (!pendingInviteId) return;
  presenceSend({
    type: "invite_response",
    inviteId: pendingInviteId,
    accept: true,
  });
});

els.inviteDecline?.addEventListener("click", () => {
  if (!pendingInviteId) return;
  presenceSend({
    type: "invite_response",
    inviteId: pendingInviteId,
    accept: false,
  });
  els.inviteBanner?.classList.add("hidden");
  pendingInviteId = null;
});

async function loadLeaderboard() {
  if (els.boardStatus) els.boardStatus.textContent = "Yuklanmoqda…";
  try {
    const res = await fetch("/api/v1/leaderboard?limit=30");
    const data = await res.json();
    const items = data.items || [];
    if (els.leaderboard) els.leaderboard.innerHTML = "";
    if (!items.length) {
      els.boardEmpty?.classList.remove("hidden");
      if (els.boardStatus) els.boardStatus.textContent = "";
      return;
    }
    els.boardEmpty?.classList.add("hidden");
    items.forEach((row, i) => {
      const li = document.createElement("li");
      const rank = document.createElement("div");
      rank.className = "rank" + (i === 0 ? " gold" : "");
      rank.textContent = String(row.rank);
      const mid = document.createElement("div");
      mid.innerHTML = `<p class="u-name"></p><p class="u-meta"></p>`;
      mid.querySelector(".u-name").textContent = row.displayName;
      mid.querySelector(".u-meta").textContent = `Reyting · ${row.rating}`;
      const pts = document.createElement("div");
      pts.className = "points";
      pts.textContent = String(row.totalPoints);
      li.append(rank, mid, pts);
      els.leaderboard?.appendChild(li);
    });
    if (els.boardStatus) {
      els.boardStatus.textContent = "";
      els.boardStatus.classList.remove("error");
    }
  } catch (err) {
    if (els.boardStatus) {
      els.boardStatus.textContent =
        err instanceof Error ? err.message : "Reyting ochilmadi";
      els.boardStatus.classList.add("error");
    }
  }
}

// Initial empty state visible until presence confirms peers.
setEmptyMessage(EMPTY_DISCONNECTED);
els.onlineEmpty?.classList.remove("hidden");
if (els.onlineCount) els.onlineCount.textContent = "0";

void (async () => {
  await bootstrapMe();
  connectPresence();
  startPresencePingLoop();
  void loadLeaderboard();
})();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    ensurePresenceConnected();
    void presencePing();
    presenceSend({ type: "heartbeat" });
    void bootstrapMe();
  }
});
