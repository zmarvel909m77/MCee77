/**
 * GAME BOT Mini App shell — Magazin / O‘yinlar / Reyting
 * GAMEE-like: profile chip top-left, games default tab.
 */

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#120e1c");
    tg.setBackgroundColor("#120e1c");
  } catch {
    /* older clients */
  }
}

const els = {
  chipNick: document.getElementById("chipNick"),
  chipAvatar: document.getElementById("chipAvatar"),
  chipFallback: document.getElementById("chipFallback"),
  profileChip: document.getElementById("profileChip"),
  profileSheet: document.getElementById("profileSheet"),
  avatarImg: document.getElementById("avatarImg"),
  avatarFallback: document.getElementById("avatarFallback"),
  avatarBtn: document.getElementById("avatarBtn"),
  avatarInput: document.getElementById("avatarInput"),
  nickInput: document.getElementById("nickInput"),
  nickCancel: document.getElementById("nickCancel"),
  nickSave: document.getElementById("nickSave"),
  nickStatus: document.getElementById("nickStatus"),
  profileStatus: document.getElementById("profileStatus"),
  statBest: document.getElementById("statBest"),
  playKarateBtn: document.getElementById("playKarateBtn"),
  leaderboard: document.getElementById("leaderboard"),
  boardEmpty: document.getElementById("boardEmpty"),
  boardStatus: document.getElementById("boardStatus"),
};

/** @type {any} */
let me = null;

function authPayload() {
  const initData = tg?.initData || "";
  if (initData) return { initData };

  const inTelegram = Boolean(tg?.initDataUnsafe?.user?.id);
  if (inTelegram) return null;

  let id = Number(sessionStorage.getItem("gb_dev_id") || 0);
  if (!id) {
    id = Date.now() % 1_000_000;
    sessionStorage.setItem("gb_dev_id", String(id));
  }
  return { devTelegramId: id, displayName: `Dev ${id}` };
}

/**
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
if (hash === "magazin" || hash === "oyinlar" || hash === "reyting") {
  setTab(hash);
} else {
  setTab("oyinlar");
}

function renderProfile(user) {
  me = user;
  const name = user.publicName || user.nickname || user.displayName || "O‘yinchi";
  if (els.chipNick) els.chipNick.textContent = name;
  if (els.statBest) {
    els.statBest.textContent = String(
      user.karateBestScore ?? user.totalPoints ?? 0,
    );
  }
  const url = user.avatarUrl;
  const applyAvatar = (img, fallback) => {
    if (!img || !fallback) return;
    if (url) {
      img.src = url;
      img.classList.remove("hidden");
      fallback.classList.add("hidden");
    } else {
      img.classList.add("hidden");
      fallback.classList.remove("hidden");
    }
  };
  applyAvatar(els.chipAvatar, els.chipFallback);
  applyAvatar(els.avatarImg, els.avatarFallback);
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

function openProfileSheet() {
  els.profileSheet?.classList.remove("hidden");
  if (els.nickInput) {
    els.nickInput.value = me?.nickname || me?.publicName || "";
    els.nickInput.focus();
  }
}

function closeProfileSheet() {
  els.profileSheet?.classList.add("hidden");
  if (els.nickStatus) els.nickStatus.textContent = "";
}

els.profileChip?.addEventListener("click", openProfileSheet);
els.nickCancel?.addEventListener("click", closeProfileSheet);
els.profileSheet?.addEventListener("click", (ev) => {
  if (ev.target === els.profileSheet) closeProfileSheet();
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
    els.nickStatus.textContent = "Saqlandi";
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

// O‘yin boshlanish tugmasi bosilganda yangi chop.m4a ovozini chalish
els.playKarateBtn?.addEventListener("click", (e) => {
  e.preventDefault(); // Sahifaning darhol sakrab o'tib ketishini oldini oladi
  
  const hitSound = document.getElementById("hitSound");
  if (hitSound) {
    hitSound.currentTime = 0;
    hitSound.play().catch(err => console.log("Ovoz xatosi:", err));
  }
  
  // Ovoz to'liqroq yangrashi uchun vaqtni 400 millisekundga uzaytirdik
  setTimeout(() => {
    location.href = "/karate/?from=app";
  }, 400);
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
      mid.querySelector(".u-meta").textContent = "Eng yaxshi ball";
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

void bootstrapMe();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void bootstrapMe();
  }
});
