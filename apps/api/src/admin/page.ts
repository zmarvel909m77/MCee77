/** Uzbek Latin admin stats panel — single HTML document (inline CSS/JS). */

export function renderAdminLoginPage(opts?: { error?: string }): string {
  const err = opts?.error
    ? `<p class="err">${escapeHtml(opts.error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>GAME BOT — Admin</title>
  <style>${ADMIN_CSS}</style>
</head>
<body>
  <main class="gate">
    <p class="brand">GAME BOT</p>
    <h1>Admin kirish</h1>
    <p class="sub">Maxfiy kalitni kiriting yoki URL da <code>?key=</code> qo‘ying.</p>
    ${err}
    <form method="GET" action="/admin">
      <label for="key">ADMIN_SECRET</label>
      <input id="key" name="key" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">Ochish</button>
    </form>
  </main>
</body>
</html>`;
}

export function renderAdminStatsPage(): string {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>GAME BOT — Statistika</title>
  <style>${ADMIN_CSS}</style>
</head>
<body>
  <main class="panel">
    <header class="head">
      <div>
        <p class="brand">GAME BOT</p>
        <h1>Statistika</h1>
        <p class="sub" id="updated">Yuklanmoqda…</p>
      </div>
      <button type="button" class="ghost" id="refresh">Yangilash</button>
    </header>

    <section class="hero-stats" aria-label="Asosiy ko‘rsatkichlar">
      <article class="stat">
        <p class="label">Jami foydalanuvchilar</p>
        <p class="num" id="totalUsers">—</p>
        <p class="hint">/start bilan kirganlar</p>
      </article>
      <article class="stat">
        <p class="label">Bugun aktiv</p>
        <p class="num" id="activeToday">—</p>
        <p class="hint">24 soatda: <span id="active24h">—</span></p>
      </article>
      <article class="stat accent">
        <p class="label">Hozir o‘yinda</p>
        <p class="num" id="inGame">—</p>
        <p class="hint">xonalar · taxminiy o‘yinchilar</p>
      </article>
    </section>

    <section class="row" aria-label="Jonli Air Hockey">
      <article class="stat compact">
        <p class="label">Air Hockey xonalari</p>
        <p class="num sm" id="activeRooms">—</p>
      </article>
      <article class="stat compact">
        <p class="label">Navbat</p>
        <p class="num sm" id="queueDepth">—</p>
      </article>
      <article class="stat compact">
        <p class="label">Bugungi o‘yinlar</p>
        <p class="num sm" id="gamesToday">—</p>
      </article>
    </section>

    <section class="top" aria-label="Top reyting">
      <h2>Top reyting</h2>
      <ol id="topList" class="top-list"></ol>
    </section>

    <section class="features" aria-label="Bot bo‘limlari">
      <div class="features-head">
        <div>
          <h2>Bot bo‘limlari</h2>
          <p class="sub tight">O‘chirilgan bo‘lim menyudan yashirinadi; buyruqlar qisqa javob beradi.</p>
        </div>
        <button type="button" id="saveFeatures">Saqlash</button>
      </div>
      <p class="sub" id="featuresStatus">Yuklanmoqda…</p>
      <ul class="toggle-list" id="featureList">
        <li>
          <div class="toggle-meta">
            <span class="toggle-title">🚀 Rocket Bird</span>
            <span class="toggle-hint">Mini App tugmasi</span>
          </div>
          <label class="switch">
            <input type="checkbox" data-flag="rocket_bird" checked />
            <span class="slider" aria-hidden="true"></span>
            <span class="switch-state">ON</span>
          </label>
        </li>
        <li>
          <div class="toggle-meta">
            <span class="toggle-title">🏒 Air Hockey</span>
            <span class="toggle-hint">Mini App tugmasi</span>
          </div>
          <label class="switch">
            <input type="checkbox" data-flag="air_hockey" checked />
            <span class="slider" aria-hidden="true"></span>
            <span class="switch-state">ON</span>
          </label>
        </li>
        <li>
          <div class="toggle-meta">
            <span class="toggle-title">🏆 Reyting</span>
            <span class="toggle-hint">Leaderboard · /rating</span>
          </div>
          <label class="switch">
            <input type="checkbox" data-flag="rating" checked />
            <span class="slider" aria-hidden="true"></span>
            <span class="switch-state">ON</span>
          </label>
        </li>
        <li>
          <div class="toggle-meta">
            <span class="toggle-title">👤 Profil</span>
            <span class="toggle-hint">Ball · /profile</span>
          </div>
          <label class="switch">
            <input type="checkbox" data-flag="profile" checked />
            <span class="slider" aria-hidden="true"></span>
            <span class="switch-state">ON</span>
          </label>
        </li>
      </ul>
    </section>
  </main>
  <script>${ADMIN_JS}</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ADMIN_CSS = `
:root {
  --bg0: #0a1628;
  --bg1: #132a4a;
  --card: rgba(255,255,255,0.06);
  --line: rgba(255,255,255,0.1);
  --text: #f3f7fc;
  --muted: #9db4d0;
  --accent: #2ec4b6;
  --accent-2: #ff9f1c;
  --danger: #ff6b6b;
  --shadow: 0 18px 50px rgba(0,0,0,0.35);
  --font: "Segoe UI", "Trebuchet MS", "Helvetica Neue", sans-serif;
  --display: "Trebuchet MS", "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  color: var(--text);
  font-family: var(--font);
  background:
    radial-gradient(90% 70% at 10% -10%, #1d4d6e 0%, transparent 55%),
    radial-gradient(80% 60% at 100% 0%, #2a3a1f 0%, transparent 45%),
    linear-gradient(160deg, var(--bg1), var(--bg0) 55%);
}
body { padding: 20px 16px 40px; }
.brand {
  margin: 0 0 4px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--accent);
  font-weight: 700;
}
h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.8rem, 5vw, 2.6rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
h2 {
  margin: 0 0 12px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.sub { margin: 8px 0 0; color: var(--muted); font-size: 0.95rem; }
.gate {
  max-width: 420px;
  margin: 12vh auto 0;
  padding: 28px 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}
.gate form { display: grid; gap: 10px; margin-top: 20px; }
.gate label { font-size: 0.85rem; color: var(--muted); }
.gate input {
  width: 100%;
  padding: 14px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(0,0,0,0.25);
  color: var(--text);
  font-size: 1rem;
}
.gate button, .ghost, .panel button {
  appearance: none;
  border: 0;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, var(--accent), #1a9f94);
  color: #042c28;
}
.err { color: var(--danger); margin: 12px 0 0; }
.panel { max-width: 920px; margin: 0 auto; }
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--line) !important;
}
.hero-stats, .row {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
}
.hero-stats { grid-template-columns: 1fr; }
.row { grid-template-columns: 1fr; }
@media (min-width: 720px) {
  .hero-stats { grid-template-columns: repeat(3, 1fr); }
  .row { grid-template-columns: repeat(3, 1fr); }
}
.stat {
  padding: 22px 20px 18px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--card);
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
}
.stat.accent {
  background: linear-gradient(160deg, rgba(46,196,182,0.22), rgba(255,255,255,0.04));
  border-color: rgba(46,196,182,0.35);
}
.stat.compact { padding: 16px 18px; }
.label {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  font-weight: 600;
}
.num {
  margin: 8px 0 4px;
  font-family: var(--display);
  font-size: clamp(2.6rem, 9vw, 3.6rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
}
.num.sm { font-size: clamp(1.8rem, 6vw, 2.4rem); }
.hint { margin: 0; color: var(--muted); font-size: 0.85rem; }
.top {
  margin-top: 18px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--card);
}
.top-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.top-list li {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0,0,0,0.18);
}
.top-list .rank {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 999px;
  background: rgba(46,196,182,0.2);
  color: var(--accent);
  font-weight: 800;
  font-size: 0.85rem;
}
.top-list .name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top-list .pts { color: var(--accent-2); font-weight: 700; font-variant-numeric: tabular-nums; }
.empty { color: var(--muted); margin: 0; }
code { color: var(--accent-2); }
.features {
  margin-top: 18px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--card);
}
.features-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.features-head h2 { margin-bottom: 4px; }
.sub.tight { margin: 0; font-size: 0.88rem; max-width: 36ch; }
#featuresStatus { margin: 0 0 14px; min-height: 1.2em; }
.toggle-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.toggle-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 14px;
  border-radius: 14px;
  background: rgba(0,0,0,0.18);
  border: 1px solid transparent;
}
.toggle-list li.off {
  opacity: 0.72;
  border-color: rgba(255,107,107,0.25);
}
.toggle-meta { min-width: 0; }
.toggle-title {
  display: block;
  font-weight: 700;
  font-size: 1.02rem;
}
.toggle-hint {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.82rem;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: relative;
  width: 52px;
  height: 30px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  border: 1px solid var(--line);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.slider::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #d7e3f2;
  transition: transform 0.2s ease, background 0.2s ease;
}
.switch input:checked + .slider {
  background: rgba(46,196,182,0.35);
  border-color: rgba(46,196,182,0.55);
}
.switch input:checked + .slider::after {
  transform: translateX(22px);
  background: var(--accent);
}
.switch input:focus-visible + .slider {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.switch-state {
  min-width: 2.4ch;
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.switch input:checked ~ .switch-state { color: var(--accent); }
#saveFeatures:disabled { opacity: 0.55; cursor: wait; }
@media (max-width: 520px) {
  .features-head { flex-direction: column; align-items: stretch; }
  .features-head button { width: 100%; }
}
`;

const ADMIN_JS = `
(function () {
  const els = {
    updated: document.getElementById("updated"),
    totalUsers: document.getElementById("totalUsers"),
    activeToday: document.getElementById("activeToday"),
    active24h: document.getElementById("active24h"),
    inGame: document.getElementById("inGame"),
    activeRooms: document.getElementById("activeRooms"),
    queueDepth: document.getElementById("queueDepth"),
    gamesToday: document.getElementById("gamesToday"),
    topList: document.getElementById("topList"),
    refresh: document.getElementById("refresh"),
    featureList: document.getElementById("featureList"),
    featuresStatus: document.getElementById("featuresStatus"),
    saveFeatures: document.getElementById("saveFeatures"),
  };

  const flagInputs = Array.from(
    els.featureList.querySelectorAll("input[data-flag]")
  );

  function fmt(n) {
    return new Intl.NumberFormat("uz-UZ").format(Number(n) || 0);
  }

  function authRedirect(res) {
    if (res.status === 403 || res.status === 404) {
      window.location.href = "/admin?need_key=1";
      return true;
    }
    return false;
  }

  function syncToggleUi(input) {
    const li = input.closest("li");
    const state = input.parentElement.querySelector(".switch-state");
    if (li) li.classList.toggle("off", !input.checked);
    if (state) state.textContent = input.checked ? "ON" : "OFF";
  }

  function applyFeatures(features) {
    for (const input of flagInputs) {
      const key = input.getAttribute("data-flag");
      if (!key || !features || typeof features[key] !== "boolean") continue;
      input.checked = features[key];
      syncToggleUi(input);
    }
  }

  function collectFeatures() {
    const out = {};
    for (const input of flagInputs) {
      const key = input.getAttribute("data-flag");
      if (!key) continue;
      out[key] = !!input.checked;
    }
    return out;
  }

  function render(data) {
    els.totalUsers.textContent = fmt(data.totalUsers);
    els.activeToday.textContent = fmt(data.activeToday);
    els.active24h.textContent = fmt(data.active24h);
    els.activeRooms.textContent = fmt(data.airHockey.activeRooms);
    els.queueDepth.textContent = fmt(data.airHockey.queueDepth);
    els.gamesToday.textContent = fmt(data.gamesToday);
    els.inGame.textContent =
      fmt(data.airHockey.activeRooms) + " · ≈" + fmt(data.airHockey.approxPlayers);
    const when = new Date(data.generatedAt);
    els.updated.textContent = "Yangilangan: " + when.toLocaleString("uz-UZ");

    els.topList.innerHTML = "";
    const items = data.topRating || [];
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Hali reyting yo‘q";
      els.topList.appendChild(p);
      return;
    }
    for (const row of items) {
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="rank">' + row.rank + "</span>" +
        '<span class="name"></span>' +
        '<span class="pts"></span>';
      li.querySelector(".name").textContent =
        row.displayName + (row.username ? " @" + row.username : "");
      li.querySelector(".pts").textContent = fmt(row.totalPoints) + " ball";
      els.topList.appendChild(li);
    }
  }

  async function loadStats() {
    els.updated.textContent = "Yuklanmoqda…";
    try {
      const res = await fetch("/api/v1/admin/stats", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (authRedirect(res)) return;
      if (!res.ok) throw new Error("HTTP " + res.status);
      render(await res.json());
    } catch (err) {
      els.updated.textContent = "Xato: " + (err && err.message ? err.message : "yuklash");
    }
  }

  async function loadFeatures() {
    els.featuresStatus.textContent = "Yuklanmoqda…";
    try {
      const res = await fetch("/api/v1/admin/features", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (authRedirect(res)) return;
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      applyFeatures(data.features || {});
      els.featuresStatus.textContent = "Hozirgi holat yuklandi";
    } catch (err) {
      els.featuresStatus.textContent =
        "Xato: " + (err && err.message ? err.message : "yuklash");
    }
  }

  async function saveFeatures() {
    els.saveFeatures.disabled = true;
    els.featuresStatus.textContent = "Saqlanmoqda…";
    try {
      const res = await fetch("/api/v1/admin/features", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ features: collectFeatures() }),
      });
      if (authRedirect(res)) return;
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      applyFeatures(data.features || {});
      els.featuresStatus.textContent =
        "Saqlandi · " + new Date().toLocaleTimeString("uz-UZ");
    } catch (err) {
      els.featuresStatus.textContent =
        "Xato: " + (err && err.message ? err.message : "saqlash");
    } finally {
      els.saveFeatures.disabled = false;
    }
  }

  for (const input of flagInputs) {
    syncToggleUi(input);
    input.addEventListener("change", function () {
      syncToggleUi(input);
      els.featuresStatus.textContent = "O‘zgarishlar saqlanmagan";
    });
  }

  els.saveFeatures.addEventListener("click", saveFeatures);
  els.refresh.addEventListener("click", function () {
    loadStats();
    loadFeatures();
  });
  loadStats();
  loadFeatures();
  setInterval(loadStats, 15000);
})();
`;
