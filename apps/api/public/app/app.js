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
    tg.setHeaderColor("#072028");
    tg.setBackgroundColor("#031216");
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
  presenceLine: document.getElementById("presenceLine"),
  presenceText: document.getElementById("presenceText"),
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

function authPayload() {
  const initData = tg?.initData || "";
  if (initData) return { initData };
  let id = Number(sessionStorage.getItem("gb_dev_id") || 0);
  if (!id) {
    id = Date.now() % 1_000_000;
    sessionStorage.setItem("gb_dev_id", String(id));
  }
  return { devTelegramId: id, displayName: `Dev ${id}` };
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === name);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.getAttribute("data-view") === name);
  });
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

function setPresence(online) {
  if (!els.presenceLine || !els.presenceText) return;
  els.presenceLine.classList.toggle("on", online);
  els.presenceText.textContent = online ? "Onlayn" : "Aloqa yo‘q";
}

function renderProfile(user) {
  me = user;
  const name = user.publicName || user.nickname || user.displayName || "O‘yinchi";
  els.nickDisplay.textContent = name;
  els.statPoints.textContent = String(user.totalPoints ?? 0);
  els.statRating.textContent = String(user.rating ?? 1000);
  els.statGames.textContent = String(user.gamesPlayed ?? 0);
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
  els.profileStatus.textContent = "Yuklanmoqda…";
  try {
    const res = await fetch("/api/v1/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authPayload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Profil ochilmadi");
    renderProfile(data.user);
    els.profileStatus.textContent = "";
  } catch (err) {
    els.profileStatus.textContent =
      err instanceof Error ? err.message : "Profil ochilmadi";
    els.profileStatus.classList.add("error");
  }
}

els.editNickBtn.addEventListener("click", () => {
  els.nickEditor.classList.remove("hidden");
  els.nickInput.value = me?.nickname || me?.publicName || "";
  els.nickInput.focus();
});

els.nickCancel.addEventListener("click", () => {
  els.nickEditor.classList.add("hidden");
  els.nickStatus.textContent = "";
});

els.nickSave.addEventListener("click", async () => {
  els.nickStatus.textContent = "Saqlanmoqda…";
  els.nickStatus.classList.remove("error");
  try {
    const res = await fetch("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...authPayload(),
        nickname: els.nickInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Saqlash xato");
    renderProfile(data.user);
    els.nickEditor.classList.add("hidden");
    els.nickStatus.textContent = "";
    presenceSend({ type: "refresh" });
  } catch (err) {
    els.nickStatus.textContent =
      err instanceof Error ? err.message : "Saqlash xato";
    els.nickStatus.classList.add("error");
  }
});

els.avatarBtn.addEventListener("click", () => els.avatarInput.click());

els.avatarInput.addEventListener("change", async () => {
  const file = els.avatarInput.files?.[0];
  if (!file) return;
  if (file.size > 700_000) {
    els.profileStatus.textContent = "Rasm juda katta (max ~500KB)";
    els.profileStatus.classList.add("error");
    return;
  }
  els.profileStatus.classList.remove("error");
  els.profileStatus.textContent = "Rasm yuklanmoqda…";
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/v1/me/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...authPayload(),
        imageBase64: dataUrl,
        mime: file.type,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Yuklash xato");
    renderProfile(data.user);
    els.profileStatus.textContent = "Rasm yangilandi";
    presenceSend({ type: "refresh" });
  } catch (err) {
    els.profileStatus.textContent =
      err instanceof Error ? err.message : "Rasm yuklanmadi";
    els.profileStatus.classList.add("error");
  } finally {
    els.avatarInput.value = "";
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

els.offlineBtn.addEventListener("click", () => goPlay("ai"));
els.local2pBtn.addEventListener("click", () => goPlay("local"));
els.randomBtn.addEventListener("click", () => goPlay("online"));

function renderOnline(users) {
  const list = Array.isArray(users) ? users : [];
  els.onlineCount.textContent = String(list.length);
  els.onlineList.innerHTML = "";
  if (!list.length) {
    els.onlineEmpty.classList.remove("hidden");
    return;
  }
  els.onlineEmpty.classList.add("hidden");
  for (const u of list) {
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
    const meta = document.createElement("div");
    meta.innerHTML = `<p class="u-name"></p><p class="u-meta"></p>`;
    meta.querySelector(".u-name").textContent = u.displayName;
    meta.querySelector(".u-meta").textContent = `Reyting · ${u.rating ?? "—"}`;
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
    li.append(av, meta, btn);
    els.onlineList.appendChild(li);
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

function connectPresence() {
  if (presenceWs) {
    try {
      presenceWs.onclose = null;
      presenceWs.close();
    } catch {
      /* ignore */
    }
  }
  presenceWs = new WebSocket(presenceUrl());
  presenceWs.onopen = () => {
    presenceWs.send(JSON.stringify({ type: "hello", ...authPayload() }));
    els.connDot.classList.add("on");
    setPresence(true);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      presenceSend({ type: "heartbeat" });
    }, 12_000);
  };
  presenceWs.onclose = () => {
    els.connDot.classList.remove("on");
    setPresence(false);
    setTimeout(connectPresence, 2500);
  };
  presenceWs.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "welcome":
      case "online":
        renderOnline(msg.users || []);
        break;
      case "invite":
        pendingInviteId = msg.inviteId;
        els.inviteText.textContent = `${msg.from?.displayName || "O‘yinchi"} sizni Air Hockeyga chaqirdi`;
        els.inviteBanner.classList.remove("hidden");
        setTab("oyin");
        break;
      case "invite_accepted":
        if (msg.playUrl) location.href = msg.playUrl;
        break;
      case "invite_declined":
      case "invite_declined_ack":
        els.inviteBanner.classList.add("hidden");
        pendingInviteId = null;
        break;
      case "invite_error":
        els.profileStatus.textContent = msg.message || "Chaqiriq amalga oshmadi";
        break;
      default:
        break;
    }
  };
}

els.inviteAccept.addEventListener("click", () => {
  if (!pendingInviteId) return;
  presenceSend({
    type: "invite_response",
    inviteId: pendingInviteId,
    accept: true,
  });
});

els.inviteDecline.addEventListener("click", () => {
  if (!pendingInviteId) return;
  presenceSend({
    type: "invite_response",
    inviteId: pendingInviteId,
    accept: false,
  });
  els.inviteBanner.classList.add("hidden");
  pendingInviteId = null;
});

async function loadLeaderboard() {
  els.boardStatus.textContent = "Yuklanmoqda…";
  try {
    const res = await fetch("/api/v1/leaderboard?limit=30");
    const data = await res.json();
    const items = data.items || [];
    els.leaderboard.innerHTML = "";
    if (!items.length) {
      els.boardEmpty.classList.remove("hidden");
      els.boardStatus.textContent = "";
      return;
    }
    els.boardEmpty.classList.add("hidden");
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
      els.leaderboard.appendChild(li);
    });
    els.boardStatus.textContent = "";
  } catch (err) {
    els.boardStatus.textContent =
      err instanceof Error ? err.message : "Reyting ochilmadi";
    els.boardStatus.classList.add("error");
  }
}

void bootstrapMe();
connectPresence();
void loadLeaderboard();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    presenceSend({ type: "heartbeat" });
    void bootstrapMe();
  }
});
