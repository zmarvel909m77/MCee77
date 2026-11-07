/**
 * Karate Strike — Timberman-style chop arcade (original art).
 * Tap left/right to chop. Same-side branch = game over.
 * 1 successful chop = 1 stored point. High score only on server.
 * Atmosphere redrawn from design refs — no third-party sprites.
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
const multiBar = document.getElementById("multiBar");
const multiBadge = document.getElementById("multiBadge");
const hint = document.getElementById("hint");
const btnMute = document.getElementById("btnMute");
const btnPause = document.getElementById("btnPause");

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#2a1248");
    tg.setBackgroundColor("#1a0f2e");
  } catch {
    /* older clients */
  }
}

/** @typedef {"left"|"right"|null} Side */
/** @typedef {"ready"|"playing"|"paused"|"over"} Phase */

/** Visible queue ~6 segments — readable like refs. */
const SEGMENTS = 6;
const ENERGY_MAX = 100;
/** Base drain/sec — ramps with score so opening feels fair, later snappy. */
const ENERGY_DRAIN = 11;
const ENERGY_REFILL = 18;
const CHOP_MS = 70;
const MULTI_DECAY = 0.55;
const MULTI_GAIN = 0.14;
const MULTI_MAX = 2.5;

/** @type {Phase} */
let phase = "ready";
let score = 0;
let best = 0;
let energy = ENERGY_MAX;
/** Visual combo multiplier only — scoring stays 1 hit = 1 point. */
let multi = 1;
let multiFill = 0;
/** @type {Side} */
let playerSide = "right";
/** @type {Side[]} */
let trunk = [];
let chopping = false;
let chopUntil = 0;
let lastTs = 0;
let submitting = false;
let lastSubmitted = false;
let shake = 0;
let muted = false;
let animT = 0;
/** Grace seconds after start before timer pressure. */
let graceLeft = 0;

/** @type {{ x: number, y: number, vx: number, vy: number, rot: number, vr: number, life: number }[]} */
let debris = [];
/** @type {{ x: number, y: number, vy: number, life: number, text: string }[]} */
let floats = [];
/** @type {{ x: number, y: number, r: number, a: number, vy: number, vx: number }[]} */
let chips = [];
/** @type {{ x: number, y: number, s: number, rot: number, vr: number, vy: number }[]} */
let petals = [];

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

/**
 * Timberman / Karate rhythm:
 * - empty segments between branches (readable gaps)
 * - never both sides on one height (Side is single-valued)
 * - alternate L/R patterns that ramp with score
 * @param {number} runScore
 * @param {Side} prevSide
 * @param {boolean} lastWasBranch
 * @returns {Side}
 */
function nextBranch(runScore, prevSide, lastWasBranch) {
  // Prefer empty after a branch — refs show clear gaps between hazards.
  const emptyChance = Math.max(0.18, 0.72 - runScore * 0.008);
  if (lastWasBranch && Math.random() < emptyChance) return null;
  // Occasional second empty early — keeps queue airy.
  if (!lastWasBranch && Math.random() < Math.max(0.08, 0.34 - runScore * 0.005)) {
    return null;
  }

  const switchChance = Math.min(0.88, 0.55 + runScore * 0.007);
  if (prevSide) {
    if (Math.random() < switchChance) {
      return prevSide === "left" ? "right" : "left";
    }
    return prevSide;
  }
  return Math.random() < 0.5 ? "left" : "right";
}

function seedTrunk() {
  // Opening queue: empties + gentle L/R with gaps (readable Timberman rhythm)
  trunk = [null, null, "left", null, "right", null];
  while (trunk.length < SEGMENTS) {
    trunk.push(null);
  }
  trunk.length = SEGMENTS;
}

function resetRun() {
  score = 0;
  energy = ENERGY_MAX;
  multi = 1;
  multiFill = 0;
  playerSide = "right";
  chopping = false;
  chopUntil = 0;
  lastSubmitted = false;
  shake = 0;
  graceLeft = 2.2;
  debris = [];
  floats = [];
  chips = [];
  seedTrunk();
  hudScore.textContent = "0";
  setEnergyUi();
  setMultiUi();
  submitStatus.textContent = "";
  submitStatus.classList.remove("error", "ok");
}

function setEnergyUi() {
  const t = Math.max(0, Math.min(1, energy / ENERGY_MAX));
  energyBar.style.transform = `scaleX(${t})`;
}

function setMultiUi() {
  const display = Math.max(1, Math.min(MULTI_MAX, multi));
  const label =
    display < 1.05 ? "1X" : `${display.toFixed(1).replace(/\.0$/, "")}X`;
  multiBadge.textContent = label;
  multiBar.style.transform = `scaleX(${Math.max(0.06, Math.min(1, multiFill))})`;
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

function roundRect(x, y, w, h, r, color) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function seedPetals(w, h) {
  petals = [];
  for (let i = 0; i < 18; i++) {
    petals.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.75,
      s: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.04,
      vy: 0.25 + Math.random() * 0.55,
    });
  }
}

function drawAtmosphere(w, h, baseY) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#3a1a6e");
  sky.addColorStop(0.28, "#6b1f78");
  sky.addColorStop(0.55, "#c23a7a");
  sky.addColorStop(0.78, "#e85a8a");
  sky.addColorStop(1, "#2a1038");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Soft dusk glow behind silhouettes
  const glow = ctx.createRadialGradient(
    w * 0.5,
    baseY * 0.72,
    10,
    w * 0.5,
    baseY * 0.72,
    w * 0.55,
  );
  glow.addColorStop(0, "rgba(255, 160, 120, 0.35)");
  glow.addColorStop(0.45, "rgba(220, 70, 140, 0.18)");
  glow.addColorStop(1, "rgba(40, 10, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(w * 0.5, baseY * 0.72, w * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Soft cloud blobs
  ctx.fillStyle = "rgba(40, 12, 60, 0.35)";
  drawCloud(w * 0.18, baseY * 0.28, 48);
  drawCloud(w * 0.78, baseY * 0.22, 40);
  drawCloud(w * 0.55, baseY * 0.18, 28);

  // Midground silhouettes — original torii / pagoda / pine (not GAMEE bitmaps)
  ctx.fillStyle = "#1a0828";
  drawTorii(w * 0.22, baseY - 8, Math.min(90, w * 0.28));
  drawPagoda(w * 0.72, baseY - 4, Math.min(70, w * 0.2));
  drawPine(w * 0.08, baseY, 38);
  drawPine(w * 0.92, baseY, 44);
  drawPine(w * 0.38, baseY, 28);
  drawBush(w * 0.5, baseY, 36);

  // Falling petals / leaves
  ctx.fillStyle = "rgba(20, 6, 30, 0.55)";
  for (const p of petals) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dark reflective ground strip
  const ground = ctx.createLinearGradient(0, baseY, 0, h);
  ground.addColorStop(0, "#12081c");
  ground.addColorStop(0.35, "#0a0612");
  ground.addColorStop(1, "#050308");
  ctx.fillStyle = ground;
  ctx.fillRect(0, baseY, w, h - baseY);

  // Reflection streaks
  ctx.strokeStyle = "rgba(255, 200, 220, 0.08)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const gy = baseY + 10 + i * 11;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, gy);
    ctx.lineTo(w * 0.92, gy + (i % 2) * 2);
    ctx.stroke();
  }

  // Foreground bush silhouettes
  ctx.fillStyle = "#0c0614";
  drawBush(w * 0.12, h, 50);
  drawBush(w * 0.88, h, 56);
}

function drawCloud(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.5, cy + 4, r * 0.4, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.45, cy + 6, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawTorii(cx, baseY, scale) {
  const w = scale;
  const h = scale * 0.85;
  const postW = w * 0.08;
  // posts
  ctx.fillRect(cx - w * 0.35, baseY - h * 0.75, postW, h * 0.75);
  ctx.fillRect(cx + w * 0.35 - postW, baseY - h * 0.75, postW, h * 0.75);
  // top lintel (kasagi)
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, baseY - h * 0.78);
  ctx.quadraticCurveTo(cx, baseY - h * 0.92, cx + w * 0.5, baseY - h * 0.78);
  ctx.lineTo(cx + w * 0.48, baseY - h * 0.7);
  ctx.quadraticCurveTo(cx, baseY - h * 0.82, cx - w * 0.48, baseY - h * 0.7);
  ctx.closePath();
  ctx.fill();
  // lower beam (nuki)
  ctx.fillRect(cx - w * 0.38, baseY - h * 0.55, w * 0.76, h * 0.07);
}

function drawPagoda(cx, baseY, scale) {
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const tw = scale * (1 - i * 0.18);
    const th = scale * 0.18;
    const ty = baseY - scale * 0.22 * (i + 1);
    ctx.beginPath();
    ctx.moveTo(cx - tw * 0.55, ty + th);
    ctx.lineTo(cx - tw * 0.4, ty);
    ctx.lineTo(cx + tw * 0.4, ty);
    ctx.lineTo(cx + tw * 0.55, ty + th);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - tw * 0.28, ty + th, tw * 0.56, scale * 0.08);
  }
  // finial
  ctx.fillRect(cx - 2, baseY - scale * 0.22 * tiers - 14, 4, 14);
}

function drawPine(cx, baseY, h) {
  ctx.beginPath();
  ctx.moveTo(cx, baseY - h);
  ctx.lineTo(cx + h * 0.35, baseY - h * 0.55);
  ctx.lineTo(cx + h * 0.18, baseY - h * 0.55);
  ctx.lineTo(cx + h * 0.42, baseY - h * 0.28);
  ctx.lineTo(cx + h * 0.2, baseY - h * 0.28);
  ctx.lineTo(cx + h * 0.48, baseY);
  ctx.lineTo(cx - h * 0.48, baseY);
  ctx.lineTo(cx - h * 0.2, baseY - h * 0.28);
  ctx.lineTo(cx - h * 0.42, baseY - h * 0.28);
  ctx.lineTo(cx - h * 0.18, baseY - h * 0.55);
  ctx.lineTo(cx - h * 0.35, baseY - h * 0.55);
  ctx.closePath();
  ctx.fill();
}

function drawBush(cx, baseY, r) {
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, baseY - r * 0.25, r * 0.4, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.3, baseY - r * 0.2, r * 0.35, 0, Math.PI * 2);
  ctx.arc(cx, baseY - r * 0.45, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} trunkW
 * @param {number} segH
 * @param {Side} side
 */
function drawBranch(x, y, trunkW, segH, side) {
  const by = y + segH * 0.32;
  const bw = trunkW * 1.55;
  const bh = segH * 0.36;
  const left = side === "left";
  const hx = left ? x - bw + 3 : x + trunkW - 3;
  // Wooden plank — same family as trunk
  roundRect(hx, by, bw, bh, 5, "#a67c52");
  // grain
  ctx.strokeStyle = "rgba(70, 40, 20, 0.28)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const gy = by + 5 + i * (bh / 3.2);
    ctx.beginPath();
    ctx.moveTo(hx + 6, gy);
    ctx.lineTo(hx + bw - 6, gy + (i % 2));
    ctx.stroke();
  }
  // dark edge near trunk
  ctx.fillStyle = "rgba(60, 30, 15, 0.25)";
  if (left) ctx.fillRect(hx + bw - 8, by, 8, bh);
  else ctx.fillRect(hx, by, 8, bh);
}

/**
 * Blocky chibi hero — red gi + black belt, side kick on chop.
 * @param {number} x
 * @param {number} y
 * @param {Side} side
 * @param {boolean} choppingNow
 */
function drawPlayer(x, y, side, choppingNow) {
  const dir = side === "left" ? 1 : -1; // face toward trunk
  const kick = choppingNow;

  // shadow under feet
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // hair block
  ctx.fillStyle = "#1a1020";
  roundRect(x - 11, y - 40, 22, 12, 4, "#1a1020");

  // head
  ctx.fillStyle = "#f0b888";
  roundRect(x - 10, y - 34, 20, 16, 5, "#f0b888");

  // body — red gi
  roundRect(x - 13, y - 18, 26, 28, 5, "#e53935");
  // gi collar V
  ctx.fillStyle = "#c62828";
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x - 8, y + 2);
  ctx.lineTo(x + 8, y + 2);
  ctx.closePath();
  ctx.fill();

  // black belt
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 13, y + 2, 26, 5);
  ctx.fillStyle = "#333";
  ctx.fillRect(x + dir * 6, y + 5, 8, 3);

  // standing leg
  ctx.fillStyle = "#e53935";
  if (kick) {
    roundRect(x - 6, y + 10, 10, 14, 3, "#e53935");
    // kicking leg stretched toward trunk
    ctx.save();
    ctx.translate(x, y + 8);
    ctx.rotate(dir * -0.95);
    roundRect(0, -5, 34, 10, 4, "#e53935");
    // foot
    roundRect(30, -6, 10, 12, 3, "#1a1020");
    ctx.restore();
  } else {
    roundRect(x - 11, y + 10, 10, 14, 3, "#e53935");
    roundRect(x + 1, y + 10, 10, 14, 3, "#e53935");
    ctx.fillStyle = "#1a1020";
    ctx.fillRect(x - 12, y + 22, 11, 5);
    ctx.fillRect(x + 1, y + 22, 11, 5);
  }

  // arms
  ctx.strokeStyle = "#f0b888";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - dir * 8, y - 8);
  if (kick) {
    ctx.lineTo(x - dir * 18, y - 20);
  } else {
    ctx.lineTo(x - dir * 16, y + 2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + dir * 6, y - 6);
  ctx.lineTo(x + dir * (kick ? 14 : 12), y + (kick ? -4 : 4));
  ctx.stroke();
}

function spawnDebris(cx, baseY, trunkW, segH, side) {
  const dir = side === "left" ? -1 : 1;
  debris.push({
    x: cx,
    y: baseY - segH,
    vx: dir * (5 + Math.random() * 3.5),
    vy: -2.5 - Math.random() * 2,
    rot: 0,
    vr: dir * 0.14,
    life: 1,
  });
  for (let i = 0; i < 6; i++) {
    chips.push({
      x: cx + (Math.random() - 0.5) * trunkW,
      y: baseY - segH * 0.5,
      r: 1.5 + Math.random() * 2.8,
      a: 1,
      vy: -1.5 - Math.random() * 3,
      vx: (Math.random() - 0.5) * 4,
    });
  }
}

function spawnFloat(x, y, text) {
  floats.push({ x, y, vy: -1.5, life: 1, text });
}

function layout() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const cx = w * 0.5;
  const trunkW = Math.min(58, w * 0.17);
  const segH = Math.min(58, (h * 0.58) / SEGMENTS);
  const baseY = h * 0.8;
  return { w, h, cx, trunkW, segH, baseY };
}

function draw(now) {
  const { w, h, cx, trunkW, segH, baseY } = layout();
  ctx.clearRect(0, 0, w, h);

  if (petals.length === 0) seedPetals(w, h);

  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  drawAtmosphere(w, h, baseY);

  // Trunk — light brown wood with vertical grain
  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const y = baseY - (i + 1) * segH + shakeX * 0.12;
    const x = cx - trunkW / 2 + shakeX;
    const shade = i % 2 === 0 ? "#c49a6c" : "#b8895a";
    roundRect(x, y, trunkW, segH + 1, 4, shade);
    // vertical grain
    ctx.strokeStyle = "rgba(90, 50, 25, 0.22)";
    ctx.lineWidth = 1.4;
    for (let g = 0; g < 4; g++) {
      const gx = x + 8 + g * ((trunkW - 16) / 3.2);
      ctx.beginPath();
      ctx.moveTo(gx, y + 4);
      ctx.lineTo(gx + (g % 2 ? 1.5 : -1), y + segH - 4);
      ctx.stroke();
    }
    // soft highlight
    ctx.fillStyle = "rgba(255, 230, 190, 0.18)";
    ctx.fillRect(x + 3, y + 2, 5, segH - 4);
    // ring
    ctx.strokeStyle = "rgba(60, 30, 12, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + segH * 0.55);
    ctx.lineTo(x + trunkW - 6, y + segH * 0.55);
    ctx.stroke();

    const branch = trunk[i];
    if (branch) drawBranch(x, y, trunkW, segH, branch);
  }

  // Stump base
  roundRect(
    cx - trunkW * 0.65 + shakeX,
    baseY - 4,
    trunkW * 1.3,
    14,
    4,
    "#8a6238",
  );

  // Player
  const playerY = baseY - segH * 0.05;
  const px =
    playerSide === "left" ? cx - trunkW / 2 - 36 : cx + trunkW / 2 + 36;
  const choppingNow = chopping && now < chopUntil;
  const chopLift = choppingNow ? 6 : 0;
  drawPlayer(px + shakeX * 0.35, playerY - chopLift, playerSide, choppingNow);

  // Soft reflection of player
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.translate(0, baseY + 4);
  ctx.scale(1, -0.32);
  drawPlayer(px + shakeX * 0.35, -(playerY - baseY) + chopLift, playerSide, false);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Debris (flying wood)
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.max(0, d.life);
    roundRect(-trunkW / 2, 0, trunkW, segH * 0.9, 3, "#c49a6c");
    ctx.strokeStyle = "rgba(90, 50, 25, 0.3)";
    ctx.strokeRect(-trunkW / 2 + 2, 4, trunkW - 4, segH * 0.7);
    ctx.restore();
  }

  for (const c of chips) {
    ctx.globalAlpha = Math.max(0, c.a);
    ctx.fillStyle = "#d4a574";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Large score on trunk (ref style)
  if (phase === "playing" || phase === "paused" || phase === "over") {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.min(68, w * 0.17);
    ctx.font = `800 ${fontSize}px Manrope, sans-serif`;
    // Large run score sits on upper trunk (ref rhythm)
    const sy = baseY - SEGMENTS * segH + segH * 1.65;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.fillStyle = "#fff";
    ctx.strokeText(String(score), cx + shakeX, sy);
    ctx.fillText(String(score), cx + shakeX, sy);
    ctx.restore();
  }

  // Floating +N
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = "#fff";
    ctx.font = "800 24px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  if (phase === "paused") {
    ctx.fillStyle = "rgba(10, 4, 20, 0.45)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = "800 28px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Pauza", cx, h * 0.45);
  }

  if (shake > 0) shake *= 0.85;
  if (shake < 0.4) shake = 0;
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

  const { cx, trunkW, segH, baseY } = layout();
  spawnDebris(cx, baseY, trunkW, segH, side);
  // Visual feedback +1 — DB contract is 1 hit = 1 point
  spawnFloat(
    side === "left" ? cx - 44 : cx + 44,
    baseY - segH * 1.1,
    "+1",
  );

  trunk.shift();
  /** @type {Side} */
  let prev = null;
  for (let i = trunk.length - 1; i >= 0; i--) {
    if (trunk[i]) {
      prev = trunk[i];
      break;
    }
  }
  const lastBranch = trunk[trunk.length - 1] != null;
  trunk.push(nextBranch(score + 1, prev, lastBranch));

  score += 1;
  hudScore.textContent = String(score);
  energy = Math.min(ENERGY_MAX, energy + ENERGY_REFILL);
  multiFill = Math.min(1, multiFill + MULTI_GAIN);
  multi = Math.min(MULTI_MAX, 1 + multiFill * (MULTI_MAX - 1));
  setEnergyUi();
  setMultiUi();
  shake = 7;
  playChopTone();
}

function playChopTone() {
  if (muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!playChopTone.ctx) playChopTone.ctx = new AC();
    const ac = playChopTone.ctx;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = 180 + Math.random() * 40;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    o.stop(ac.currentTime + 0.09);
  } catch {
    /* ignore */
  }
}
/** @type {AudioContext | undefined} */
playChopTone.ctx = undefined;

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

function togglePause() {
  if (phase === "playing") {
    phase = "paused";
    hint.textContent = "Davom etish uchun pauzani bosing";
  } else if (phase === "paused") {
    phase = "playing";
    lastTs = performance.now();
    hint.textContent = "Chap yoki o‘ng tomonga bosing";
  }
}

function onPointer(clientX) {
  if (phase === "paused") return;
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
    else if (phase === "playing") chop("left");
  } else if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") {
    if (phase === "ready") startGame();
    else if (phase === "playing") chop("right");
  } else if (ev.key === " " || ev.key === "Enter") {
    if (phase === "paused") togglePause();
    else if (phase !== "playing") startGame();
  } else if (ev.key === "p" || ev.key === "P") {
    togglePause();
  } else if (ev.key === "m" || ev.key === "M") {
    muted = !muted;
    btnMute?.classList.toggle("muted", muted);
  }
});

primaryBtn.addEventListener("click", () => {
  startGame();
});

btnMute?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  muted = !muted;
  btnMute.classList.toggle("muted", muted);
});

btnPause?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (phase === "ready") startGame();
  else togglePause();
});

function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  animT += dt;

  if (phase === "playing") {
    if (graceLeft > 0) {
      graceLeft -= dt;
    } else {
      const drainScale = Math.min(1.55, 0.62 + score * 0.014);
      energy -= ENERGY_DRAIN * drainScale * dt;
    }
    multiFill = Math.max(0, multiFill - MULTI_DECAY * dt * 0.35);
    multi = Math.max(1, 1 + multiFill * (MULTI_MAX - 1));
    setMultiUi();
    if (energy <= 0) {
      energy = 0;
      setEnergyUi();
      endGame("Vaqt tugadi!");
    } else {
      setEnergyUi();
    }
  }

  // Petals drift always (atmosphere)
  const { w, h } = layout();
  for (const p of petals) {
    p.y += p.vy * (phase === "paused" ? 0.2 : 1);
    p.x += Math.sin(animT * 1.2 + p.rot) * 0.35;
    p.rot += p.vr;
    if (p.y > h * 0.78) {
      p.y = -10;
      p.x = Math.random() * w;
    }
  }

  if (phase !== "paused") {
    for (const d of debris) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 18 * dt;
      d.rot += d.vr;
      d.life -= dt * 1.15;
    }
    debris = debris.filter((d) => d.life > 0);

    for (const c of chips) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 12 * dt;
      c.a -= dt * 1.9;
    }
    chips = chips.filter((c) => c.a > 0);

    for (const f of floats) {
      f.y += f.vy;
      f.life -= dt * 1.25;
    }
    floats = floats.filter((f) => f.life > 0);
  }

  draw(ts);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  resize();
  petals = [];
});
resize();
seedTrunk();
showOverlay(
  "Karate Strike",
  "Chap yoki o‘ng tomonga bosing. Novda siz tomonda bo‘lsa — ehtiyot!",
  "O‘ynash",
);
void loadBest();
requestAnimationFrame(loop);

// Optional smart bot for demos: /karate/?bot=1
if (new URLSearchParams(location.search).get("bot") === "1") {
  const botTick = () => {
    if (phase === "ready") {
      startGame();
    } else if (phase === "playing") {
      const danger = trunk[0];
      const side =
        danger === "left" ? "right" : danger === "right" ? "left" : playerSide;
      chop(side);
    } else if (phase === "over") {
      startGame();
    }
    setTimeout(botTick, 120);
  };
  setTimeout(botTick, 600);
}
