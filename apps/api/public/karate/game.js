/**
 * Karate — Timberman / Karate Kido style.
 * Tap left/right to chop. Wrong-side branch = game over.
 * 1 successful chop = 1 point. High score only on server.
 */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayScore = document.getElementById("overlayScore");
const submitStatus = document.getElementById("submitStatus");
const primaryBtn = document.getElementById("primaryBtn");
const hudScore = document.getElementById("hudScore");
const hudBest = document.getElementById("hudBest");
const energyBar = document.getElementById("energyBar");
const hint = document.getElementById("hint");

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#181028");
    tg.setBackgroundColor("#181028");
  } catch {
    /* older clients */
  }
}

/** @typedef {"left"|"right"|null} Side */
/** @typedef {"ready"|"playing"|"over"} Phase */

const SEGMENTS = 8;
const ENERGY_MAX = 100;
const ENERGY_DRAIN = 18; // per second while playing
const ENERGY_REFILL = 12; // per successful chop
const CHOP_MS = 120;

/** @type {Phase} */
let phase = "ready";
let score = 0;
let best = 0;
let energy = ENERGY_MAX;
/** @type {Side} */
let playerSide = "left";
/** @type {Side[]} */
let trunk = [];
let chopping = false;
let chopUntil = 0;
let lastTs = 0;
let submitting = false;
let lastSubmitted = false;
let shake = 0;

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

async function waitForAuthPayload(maxMs = 2500) {
  const started = Date.now();
  let payload = authPayload();
  while (!payload && Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, 100));
    payload = authPayload();
  }
  return payload;
}

function randomBranch() {
  const r = Math.random();
  if (r < 0.38) return "left";
  if (r < 0.76) return "right";
  return null;
}

function seedTrunk() {
  trunk = [];
  for (let i = 0; i < SEGMENTS; i++) {
    // First few safe so player can start.
    trunk.push(i < 2 ? null : randomBranch());
  }
  // Never put a branch on the side the player starts on for the bottom segment.
  trunk[0] = null;
}

function resetRun() {
  score = 0;
  energy = ENERGY_MAX;
  playerSide = "left";
  chopping = false;
  chopUntil = 0;
  lastSubmitted = false;
  shake = 0;
  seedTrunk();
  hudScore.textContent = "0";
  setEnergyUi();
  submitStatus.textContent = "";
  submitStatus.classList.remove("error", "ok");
}

function setEnergyUi() {
  const t = Math.max(0, Math.min(1, energy / ENERGY_MAX));
  energyBar.style.transform = `scaleX(${t})`;
}

function showOverlay(title, text, btnLabel) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayScore.textContent = String(score);
  primaryBtn.textContent = btnLabel;
  overlay.classList.remove("hidden");
  hint.style.visibility = "hidden";
}

function hideOverlay() {
  overlay.classList.add("hidden");
  hint.style.visibility = "visible";
}

function resize() {
  const parent = canvas.parentElement;
  const w = parent.clientWidth;
  const h = Math.max(280, parent.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(now) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Sky / ground atmosphere
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#2a1a55");
  sky.addColorStop(0.55, "#1a1230");
  sky.addColorStop(1, "#0c1a12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Soft hills
  ctx.fillStyle = "#14301f";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(w * 0.25, h * 0.7, w * 0.5, h * 0.78);
  ctx.quadraticCurveTo(w * 0.75, h * 0.86, w, h * 0.76);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  const cx = w * 0.5;
  const trunkW = Math.min(56, w * 0.16);
  const segH = Math.min(52, (h * 0.55) / SEGMENTS);
  const baseY = h * 0.82;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;

  // Trunk segments (bottom = index 0, under player chop)
  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const y = baseY - (i + 1) * segH + shakeX * 0.15;
    const x = cx - trunkW / 2 + shakeX;
    const shade = i % 2 === 0 ? "#8B5A2B" : "#7A4A22";
    roundRect(x, y, trunkW, segH + 1, 4, shade);
    // bark rings
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + segH * 0.55);
    ctx.lineTo(x + trunkW - 6, y + segH * 0.55);
    ctx.stroke();

    const branch = trunk[i];
    if (branch) {
      const by = y + segH * 0.35;
      const bw = trunkW * 1.35;
      const bh = segH * 0.42;
      if (branch === "left") {
        roundRect(x - bw + 4, by, bw, bh, 8, "#4CAF50");
        roundRect(x - bw + 10, by + 4, bw * 0.55, bh * 0.55, 6, "#81C784");
      } else {
        roundRect(x + trunkW - 4, by, bw, bh, 8, "#4CAF50");
        roundRect(x + trunkW + bw * 0.25, by + 4, bw * 0.55, bh * 0.55, 6, "#81C784");
      }
    }
  }

  // Player
  const playerY = baseY - segH * 0.15;
  const px =
    playerSide === "left"
      ? cx - trunkW / 2 - 38
      : cx + trunkW / 2 + 38;
  const chopLift = chopping && now < chopUntil ? 8 : 0;
  drawPlayer(px + shakeX * 0.4, playerY - chopLift, playerSide, chopping && now < chopUntil);

  // Ground stump shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 8, trunkW * 0.9, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  if (shake > 0) shake *= 0.85;
  if (shake < 0.4) shake = 0;
}

function roundRect(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Side} side
 * @param {boolean} choppingNow
 */
function drawPlayer(x, y, side, choppingNow) {
  const dir = side === "left" ? 1 : -1;
  // body
  ctx.fillStyle = "#F5C26B";
  ctx.beginPath();
  ctx.arc(x, y - 28, 12, 0, Math.PI * 2);
  ctx.fill();
  // gi
  ctx.fillStyle = "#E8E0FF";
  roundRect(x - 11, y - 16, 22, 28, 6, "#E8E0FF");
  ctx.fillStyle = "#2A1B4D";
  roundRect(x - 11, y + 10, 22, 10, 3, "#2A1B4D");
  // belt
  ctx.fillStyle = "#8b6cf0";
  ctx.fillRect(x - 11, y + 2, 22, 4);
  // arm / chop
  ctx.strokeStyle = "#F5C26B";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  if (choppingNow) {
    ctx.lineTo(x + dir * 28, y - 22);
  } else {
    ctx.lineTo(x + dir * 18, y - 2);
  }
  ctx.stroke();
  // feet
  ctx.fillStyle = "#1a1028";
  ctx.fillRect(x - 10, y + 18, 8, 5);
  ctx.fillRect(x + 2, y + 18, 8, 5);
}

/**
 * @param {Side} side
 */
function chop(side) {
  if (phase !== "playing" || !side) return;
  if (chopping && performance.now() < chopUntil) return;

  playerSide = side;
  chopping = true;
  chopUntil = performance.now() + CHOP_MS;

  const danger = trunk[0];
  if (danger && danger === side) {
    endGame("Novda urildi!");
    return;
  }

  // Success — shift trunk down (remove bottom, push new top)
  trunk.shift();
  let next = randomBranch();
  // Avoid two identical branches stacked sometimes feels unfair — soft bias ok
  const top = trunk[trunk.length - 1];
  if (next && top && next === top && Math.random() < 0.45) {
    next = next === "left" ? "right" : "left";
  }
  trunk.push(next);

  score += 1;
  hudScore.textContent = String(score);
  energy = Math.min(ENERGY_MAX, energy + ENERGY_REFILL);
  setEnergyUi();
  shake = 6;
}

function endGame(reason) {
  if (phase === "over") return;
  phase = "over";
  chopping = false;
  shake = 12;
  showOverlay(
    "O‘yin tugadi",
    reason || "Yana urinib ko‘ring!",
    "Qayta o‘ynash",
  );
  void submitScore();
}

async function submitScore() {
  if (lastSubmitted || submitting) return;
  submitting = true;
  submitStatus.textContent = "Saqlanmoqda…";
  submitStatus.classList.remove("error", "ok");
  try {
    const auth = await waitForAuthPayload();
    if (!auth) throw new Error("Auth yo‘q — bot orqali oching");
    const res = await fetch("/api/v1/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        game: "karate",
        mode: "solo",
        points: score,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Saqlash xato");
    lastSubmitted = true;
    best = Number(data.bestScore ?? data.user?.totalPoints ?? best);
    hudBest.textContent = String(best);
    if (data.isNewBest) {
      submitStatus.textContent = `Yangi rekord: ${best}!`;
      submitStatus.classList.add("ok");
    } else {
      submitStatus.textContent = `Rekord saqlandi: ${best}`;
      submitStatus.classList.add("ok");
    }
  } catch (err) {
    submitStatus.textContent =
      err instanceof Error ? err.message : "Saqlash xato";
    submitStatus.classList.add("error");
  } finally {
    submitting = false;
  }
}

async function loadBest() {
  try {
    const auth = await waitForAuthPayload(1200);
    if (!auth) return;
    const res = await fetch("/api/v1/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });
    const data = await res.json();
    if (!res.ok) return;
    best = Number(
      data.user?.karateBestScore ?? data.user?.totalPoints ?? 0,
    );
    hudBest.textContent = String(best);
  } catch {
    /* ignore */
  }
}

function startGame() {
  resetRun();
  phase = "playing";
  hideOverlay();
  lastTs = performance.now();
}

function onPointer(clientX) {
  if (phase === "ready" || phase === "over") {
    if (phase === "ready") startGame();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const mid = rect.left + rect.width / 2;
  chop(clientX < mid ? "left" : "right");
}

canvas.addEventListener(
  "pointerdown",
  (ev) => {
    ev.preventDefault();
    onPointer(ev.clientX);
  },
  { passive: false },
);

window.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") {
    if (phase === "ready") startGame();
    else chop("left");
  } else if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") {
    if (phase === "ready") startGame();
    else chop("right");
  } else if (ev.key === " " || ev.key === "Enter") {
    if (phase !== "playing") startGame();
  }
});

primaryBtn.addEventListener("click", () => {
  startGame();
});

function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (phase === "playing") {
    energy -= ENERGY_DRAIN * dt;
    if (energy <= 0) {
      energy = 0;
      setEnergyUi();
      endGame("Vaqt tugadi!");
    } else {
      setEnergyUi();
    }
  }

  draw(ts);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
resize();
seedTrunk();
showOverlay(
  "Karate",
  "Chap yoki o‘ng tomonga bosing. Novda siz tomonda bo‘lsa — ehtiyot!",
  "O‘ynash",
);
void loadBest();
requestAnimationFrame(loop);
