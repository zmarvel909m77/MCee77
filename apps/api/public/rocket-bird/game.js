/**
 * Rocket Bird — Flappy-style solo Mini App (canvas).
 * Tap / click / Space to thrust. Score = pipes passed.
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

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#07111f");
    tg.setBackgroundColor("#07111f");
  } catch {
    /* older clients */
  }
}

const W = canvas.width;
const H = canvas.height;

const GRAVITY = 0.28;
const FLAP = -6.4;
const PIPE_WIDTH = 58;
const PIPE_GAP = 175;
const PIPE_SPEED = 2.15;
const PIPE_EVERY = 110; // frames
const ROCKET_R = 16;
const START_GRACE_FRAMES = 45;

/** @typedef {"ready"|"playing"|"over"} Phase */

/** @type {Phase} */
let phase = "ready";
let score = 0;
let frame = 0;
let submitting = false;
let lastSubmitted = false;

const rocket = {
  x: W * 0.28,
  y: H * 0.45,
  vy: 0,
  angle: 0,
};

/** @type {{ x: number, gapY: number, passed: boolean }[]} */
let pipes = [];

/** @type {{ x: number, y: number, r: number, s: number }[]} */
const stars = Array.from({ length: 48 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 1.6 + 0.4,
  s: Math.random() * 0.4 + 0.1,
}));

function resetGame() {
  score = 0;
  frame = 0;
  pipes = [];
  rocket.x = W * 0.28;
  rocket.y = H * 0.45;
  rocket.vy = 0;
  rocket.angle = 0;
  hudScore.textContent = "0";
  lastSubmitted = false;
  submitStatus.textContent = "";
  submitStatus.classList.remove("error");
}

function showReady() {
  phase = "ready";
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "Rocket Bird";
  overlayText.textContent =
    "Tegin yoki bo‘sh joy — raketa uchadi. Quvurlardan o‘ting!";
  overlayScore.classList.add("hidden");
  primaryBtn.textContent = "Boshlash";
  submitStatus.textContent = "";
}

function showGameOver() {
  phase = "over";
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "O‘yin tugadi";
  overlayText.textContent = "Ball reytingga qo‘shiladi.";
  overlayScore.textContent = `Natija: ${score}`;
  overlayScore.classList.remove("hidden");
  primaryBtn.textContent = "Qayta o‘ynash";
  void submitScore();
}

function startPlay() {
  resetGame();
  phase = "playing";
  overlay.classList.add("hidden");
  flap();
}

function flap() {
  if (phase !== "playing") return;
  rocket.vy = FLAP;
}

function spawnPipe() {
  const margin = 80;
  const gapY = margin + Math.random() * (H - margin * 2 - PIPE_GAP);
  pipes.push({ x: W + 20, gapY, passed: false });
}

function hitPipe(p) {
  const rx = rocket.x;
  const ry = rocket.y;
  const r = ROCKET_R - 2;
  if (rx + r < p.x || rx - r > p.x + PIPE_WIDTH) return false;
  if (ry - r < p.gapY) return true;
  if (ry + r > p.gapY + PIPE_GAP) return true;
  return false;
}

function update() {
  if (phase !== "playing") return;
  frame += 1;

  rocket.vy += GRAVITY;
  rocket.y += rocket.vy;
  rocket.angle = Math.max(-0.6, Math.min(0.9, rocket.vy / 12));

  if (frame === START_GRACE_FRAMES + 1 || (frame > START_GRACE_FRAMES && frame % PIPE_EVERY === 0)) {
    spawnPipe();
  }

  for (const p of pipes) {
    p.x -= PIPE_SPEED;
    if (!p.passed && p.x + PIPE_WIDTH < rocket.x) {
      p.passed = true;
      score += 1;
      hudScore.textContent = String(score);
    }
  }
  pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -40);

  // Soft ceiling/floor clamp during grace so the first tap can't instantly end the run
  if (frame <= START_GRACE_FRAMES) {
    rocket.y = Math.min(Math.max(rocket.y, ROCKET_R + 4), H - 28 - ROCKET_R - 4);
    return;
  }

  if (rocket.y + ROCKET_R > H - 28 || rocket.y - ROCKET_R < 0) {
    showGameOver();
    return;
  }
  for (const p of pipes) {
    if (hitPipe(p)) {
      showGameOver();
      return;
    }
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#152a4a");
  g.addColorStop(0.55, "#0c1a30");
  g.addColorStop(1, "#07111f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    s.x -= s.s;
    if (s.x < 0) s.x = W;
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ground strip
  ctx.fillStyle = "#1c3a28";
  ctx.fillRect(0, H - 28, W, 28);
  ctx.fillStyle = "#2f6b45";
  ctx.fillRect(0, H - 28, W, 6);
}

function drawRocket() {
  ctx.save();
  ctx.translate(rocket.x, rocket.y);
  ctx.rotate(rocket.angle);

  // flame
  if (phase === "playing") {
    const flicker = 8 + Math.random() * 10;
    const flame = ctx.createLinearGradient(-flicker - 8, 0, 0, 0);
    flame.addColorStop(0, "rgba(255, 210, 80, 0)");
    flame.addColorStop(0.4, "#ff9f1c");
    flame.addColorStop(1, "#ff4d00");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(-10 - flicker, 0);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
  }

  // body
  const body = ctx.createLinearGradient(-14, 0, 18, 0);
  body.addColorStop(0, "#c9d6e8");
  body.addColorStop(0.45, "#ffffff");
  body.addColorStop(1, "#ff6b2c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.quadraticCurveTo(10, -11, -6, -10);
  ctx.lineTo(-14, -6);
  ctx.lineTo(-14, 6);
  ctx.lineTo(-6, 10);
  ctx.quadraticCurveTo(10, 11, 18, 0);
  ctx.closePath();
  ctx.fill();

  // window
  ctx.fillStyle = "#7ec8ff";
  ctx.beginPath();
  ctx.arc(4, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a4a66";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // fins
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(-16, -16);
  ctx.lineTo(-10, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(-16, 16);
  ctx.lineTo(-10, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPipes() {
  for (const p of pipes) {
    const topH = p.gapY;
    const botY = p.gapY + PIPE_GAP;
    const botH = H - 28 - botY;

    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
    grad.addColorStop(0, "#1f8f6a");
    grad.addColorStop(0.5, "#33d19a");
    grad.addColorStop(1, "#187a58");

    ctx.fillStyle = grad;
    ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);
    ctx.fillRect(p.x, botY, PIPE_WIDTH, botH);

    ctx.fillStyle = "#0f5a40";
    ctx.fillRect(p.x - 4, topH - 18, PIPE_WIDTH + 8, 18);
    ctx.fillRect(p.x - 4, botY, PIPE_WIDTH + 8, 18);

    // asteroid-ish rim lights
    ctx.fillStyle = "rgba(255, 209, 102, 0.35)";
    ctx.fillRect(p.x + 8, 10, 6, Math.max(0, topH - 30));
    ctx.fillRect(p.x + 8, botY + 22, 6, Math.max(0, botH - 30));
  }
}

function draw() {
  drawBackground();
  drawPipes();
  drawRocket();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

async function submitScore() {
  if (lastSubmitted || submitting) return;
  submitting = true;
  submitStatus.textContent = "Ball yuborilmoqda…";
  submitStatus.classList.remove("error");

  const initData = tg?.initData || "";
  const payload = {
    game: "rocket_bird",
    mode: "solo",
    points: score,
    meta: { client: "rocket-bird-web", ts: Date.now() },
  };

  if (initData) {
    payload.initData = initData;
  } else {
    // Local browser testing without Telegram WebApp context
    payload.devTelegramId = 900001;
  }

  try {
    const res = await fetch("/api/v1/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    lastSubmitted = true;
    const total = data.user?.totalPoints ?? "?";
    submitStatus.textContent = `+${data.pointsAwarded} ball · jami ${total}`;
  } catch (err) {
    submitStatus.textContent = `Yuborilmadi: ${err.message || err}`;
    submitStatus.classList.add("error");
  } finally {
    submitting = false;
  }
}

function onPointer() {
  if (phase === "ready") {
    startPlay();
    return;
  }
  if (phase === "playing") {
    flap();
    return;
  }
}

primaryBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (phase === "ready" || phase === "over") startPlay();
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  onPointer();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (phase === "ready" || phase === "over") startPlay();
    else flap();
  }
});

showReady();
requestAnimationFrame(loop);
