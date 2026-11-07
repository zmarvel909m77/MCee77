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
        <p class="label">Karate Strike rekordchilar</p>
        <p class="num" id="karatePlayers">—</p>
        <p class="hint">eng yuqori: <span id="topKarateScore">—</span></p>
      </article>
    </section>

    <section class="row" aria-label="Karate Strike">
      <article class="stat compact">
        <p class="label">Bugungi o‘yinlar</p>
        <p class="num sm" id="gamesToday">—</p>
      </article>
      <article class="stat compact">
        <p class="label">Rekordchilar</p>
        <p class="num sm" id="karatePlayers2">—</p>
      </article>
      <article class="stat compact">
        <p class="label">Eng yaxshi ball</p>
        <p class="num sm" id="topKarateScore2">—</p>
      </article>
    </section>

    <section class="top" aria-label="Top reyting">
      <h2>Top Karate Strike</h2>
      <ol id="topList" class="top-list"></ol>
    </section>

    <section class="broadcast" aria-label="Botni yangilash">
      <div class="broadcast-head">
        <div>
          <h2>Botni yangilash</h2>
          <p class="sub tight">Barcha foydalanuvchilarga yangi /start (O‘ynash · Do‘kon) yuboriladi; eski reply klaviatura olib tashlanadi.</p>
        </div>
        <button type="button" id="broadcastStart">Hammaga /start yuborish</button>
      </div>
      <p class="sub" id="broadcastStatus">Faqat aniq bosilganda ishlaydi — avtomatik takrorlanmaydi.</p>
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
.broadcast {
  margin-top: 18px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--card);
}
.broadcast-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.broadcast-head h2 { margin-bottom: 4px; }
.sub.tight { margin: 0; font-size: 0.88rem; max-width: 48ch; }
#broadcastStatus { margin: 0; min-height: 1.2em; }
#broadcastStart:disabled { opacity: 0.55; cursor: wait; }
@media (max-width: 520px) {
  .broadcast-head { flex-direction: column; align-items: stretch; }
  .broadcast-head button { width: 100%; }
}
`;

const ADMIN_JS = `
(function () {
  const els = {
    updated: document.getElementById("updated"),
    totalUsers: document.getElementById("totalUsers"),
    activeToday: document.getElementById("activeToday"),
    active24h: document.getElementById("active24h"),
    karatePlayers: document.getElementById("karatePlayers"),
    karatePlayers2: document.getElementById("karatePlayers2"),
    topKarateScore: document.getElementById("topKarateScore"),
    topKarateScore2: document.getElementById("topKarateScore2"),
    gamesToday: document.getElementById("gamesToday"),
    topList: document.getElementById("topList"),
    refresh: document.getElementById("refresh"),
    broadcastStart: document.getElementById("broadcastStart"),
    broadcastStatus: document.getElementById("broadcastStatus"),
  };

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

  function render(data) {
    els.totalUsers.textContent = fmt(data.totalUsers);
    els.activeToday.textContent = fmt(data.activeToday);
    els.active24h.textContent = fmt(data.active24h);
    els.gamesToday.textContent = fmt(data.gamesToday);
    els.karatePlayers.textContent = fmt(data.karatePlayers);
    els.karatePlayers2.textContent = fmt(data.karatePlayers);
    els.topKarateScore.textContent = fmt(data.topKarateScore);
    els.topKarateScore2.textContent = fmt(data.topKarateScore);
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
      li.querySelector(".name").textContent = row.displayName;
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

  async function broadcastStart() {
    const ok = window.confirm(
      "Barcha foydalanuvchilarga yangi /start yuborilsinmi?\\n\\nBu amal faqat bir marta, siz bosganingizda ishlaydi."
    );
    if (!ok) return;

    els.broadcastStart.disabled = true;
    els.broadcastStatus.textContent = "Yuborilmoqda… biroz kuting";
    try {
      const res = await fetch("/api/v1/admin/broadcast-start", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (authRedirect(res)) return;
      const data = await res.json().catch(function () { return {}; });
      if (res.status === 409) {
        els.broadcastStatus.textContent =
          "Allaqachon ketmoqda — tugashini kuting";
        return;
      }
      if (!res.ok) {
        throw new Error(
          (data && (data.message || data.error)) || ("HTTP " + res.status)
        );
      }
      els.broadcastStatus.textContent =
        "Tayyor: " +
        fmt(data.sent) + " yuborildi · " +
        fmt(data.blocked) + " bloklagan · " +
        fmt(data.failed) + " xato · jami " +
        fmt(data.total) +
        " (" + Math.round((Number(data.durationMs) || 0) / 1000) + " s)";
    } catch (err) {
      els.broadcastStatus.textContent =
        "Xato: " + (err && err.message ? err.message : "yuborish");
    } finally {
      els.broadcastStart.disabled = false;
    }
  }

  els.refresh.addEventListener("click", loadStats);
  els.broadcastStart.addEventListener("click", broadcastStart);
  loadStats();
  setInterval(loadStats, 15000);
})();
`;
