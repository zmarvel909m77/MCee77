/**
 * City Strike — original urban chop arcade.
 * Tap left/right to strike the tower. Same-side hazard = game over.
 * 1 successful hit = 1 point. High score only on server.
 * Art: original canvas vectors (no third-party sprites).
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

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#1a0f2e");
    tg.setBackgroundColor("#1a0f2e");
  } catch {
    /* older clients */
  }
}

/** @typedef {"left"|"right"|null} Side */
/** @typedef {"ready"|"playing"|"over"} Phase */
/** @typedef {"balcony"|"ac"|"scaffold"|"billboard"} HazardKind */

const SEGMENTS = 8;
const ENERGY_MAX = 100;
const ENERGY_DRAIN = 18;
const ENERGY_REFILL = 12;
const CHOP_MS = 120;
const MULTI_DECAY = 0.55; // per second toward 1.0
const MULTI_GAIN = 0.12; // visual combo fill per hit
const MULTI_MAX = 2.5;

/** @type {Phase} */
let phase = "ready";
let score = 0;
let best = 0;
let energy = ENERGY_MAX;
/** Visual combo multiplier (HUD feel); scoring stays 1 hit = 1 point. */
let multi = 1;
let multiFill = 0;
/** @type {Side} */
let playerSide = "left";
/** @type {{ side: Side, kind: HazardKind }[]} */
let trunk = [];
let chopping = false;
let chopUntil = 0;
let lastTs = 0;
let submitting = false;
let lastSubmitted = false;
let shake = 0;

/** @type {{ x: number, y: number, vx: number, vy: number, rot: number, vr: number, life: number, kind: HazardKind| "beam", side: Side }[]} */
let debris = [];
/** @type {{ x: number, y: number, vy: number, life: number, text: string }[]} */
let floats = [];
/** @type {{ x: number, y: number, r: number, a: number, vy: number }[]} */
let sparks = [];

const HAZARD_KINDS = /** @type {HazardKind[]} */ ([
  "balcony",
  "ac",
  "scaffold",
  "billboard",
]);

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

function randomHazard() {
  const r = Math.random();
  if (r < 0.38) {
    return {
      side: /** @type {Side} */ ("left"),
      kind: HAZARD_KINDS[(Math.random() * HAZARD_KINDS.length) | 0],
    };
  }
  if (r < 0.76) {
    return {
      side: /** @type {Side} */ ("right"),
      kind: HAZARD_KINDS[(Math.random() * HAZARD_KINDS.length) | 0],
    };
  }
  return { side: null, kind: "balcony" };
}

function seedTrunk() {
  trunk = [];
  for (let i = 0; i < SEGMENTS; i++) {
    trunk.push(i < 2 ? { side: null, kind: "balcony" } : randomHazard());
  }
  trunk[0] = { side: null, kind: "balcony" };
}

function resetRun() {
  score = 0;
  energy = ENERGY_MAX;
  multi = 1;
  multiFill = 0;
  playerSide = "left";
  chopping = false;
  chopUntil = 0;
  lastSubmitted = false;
  shake = 0;
  debris = [];
  floats = [];
  sparks = [];
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

function drawSkyline(w, h, baseY) {
  // Neon dusk sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#3b1760");
  sky.addColorStop(0.35, "#6b1f6e");
  sky.addColorStop(0.62, "#c24a7a");
  sky.addColorStop(1, "#1a1028");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Soft sun disk (not hinomaru — warm dusk orb)
  const sunX = w * 0.5;
  const sunY = h * 0.42;
  const sunR = Math.min(w, h) * 0.16;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sunGrad.addColorStop(0, "rgba(255, 200, 120, 0.95)");
  sunGrad.addColorStop(0.55, "rgba(255, 120, 90, 0.55)");
  sunGrad.addColorStop(1, "rgba(190, 60, 140, 0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Far skyline silhouettes — modern glass towers
  const buildings = [
    { x: 0.02, bw: 0.07, bh: 0.28 },
    { x: 0.1, bw: 0.05, bh: 0.38 },
    { x: 0.16, bw: 0.09, bh: 0.22 },
    { x: 0.26, bw: 0.06, bh: 0.34 },
    { x: 0.68, bw: 0.07, bh: 0.3 },
    { x: 0.76, bw: 0.05, bh: 0.42 },
    { x: 0.82, bw: 0.08, bh: 0.24 },
    { x: 0.91, bw: 0.06, bh: 0.36 },
  ];
  for (const b of buildings) {
    const bx = w * b.x;
    const bw = w * b.bw;
    const bh = h * b.bh;
    const by = baseY - bh;
    ctx.fillStyle = "#14081f";
    ctx.fillRect(bx, by, bw, bh);
    // Window grid neon (deterministic — no per-frame flicker)
    ctx.fillStyle = "rgba(255, 120, 200, 0.18)";
    for (let wy = by + 8; wy < baseY - 6; wy += 10) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) {
        const lit = ((wx * 17 + wy * 31) | 0) % 5 !== 0;
        if (lit) ctx.fillRect(wx, wy, 3, 4);
      }
    }
    // Antenna / rooftop box
    ctx.fillStyle = "#0c0614";
    ctx.fillRect(bx + bw * 0.35, by - 10, 2, 10);
  }

  // Streetlights
  for (const lx of [0.08, 0.22, 0.78, 0.92]) {
    const x = w * lx;
    ctx.strokeStyle = "#1a0a28";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - 42);
    ctx.lineTo(x + (lx < 0.5 ? 10 : -10), baseY - 48);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 210, 120, 0.55)";
    ctx.beginPath();
    ctx.arc(x + (lx < 0.5 ? 10 : -10), baseY - 48, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reflective street
  const ground = ctx.createLinearGradient(0, baseY, 0, h);
  ground.addColorStop(0, "#12081c");
  ground.addColorStop(1, "#06040c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, baseY, w, h - baseY);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gy = baseY + 12 + i * 14;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} trunkW
 * @param {number} segH
 * @param {Side} side
 * @param {HazardKind} kind
 */
function drawHazard(x, y, trunkW, segH, side, kind) {
  const by = y + segH * 0.28;
  const bw = trunkW * 1.45;
  const bh = segH * 0.48;
  const left = side === "left";
  const hx = left ? x - bw + 4 : x + trunkW - 4;

  if (kind === "ac") {
    roundRect(hx, by, bw * 0.85, bh, 4, "#5a6a78");
    roundRect(hx + 4, by + 3, bw * 0.85 - 8, bh - 6, 3, "#3d4a55");
    ctx.strokeStyle = "rgba(200, 220, 240, 0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const ly = by + 6 + i * (bh / 4);
      ctx.beginPath();
      ctx.moveTo(hx + 6, ly);
      ctx.lineTo(hx + bw * 0.85 - 6, ly);
      ctx.stroke();
    }
    return;
  }

  if (kind === "scaffold") {
    ctx.strokeStyle = "#f0c040";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left ? x : x + trunkW, by + bh * 0.5);
    ctx.lineTo(left ? hx : hx + bw, by + bh * 0.5);
    ctx.stroke();
    roundRect(hx, by, bw, bh * 0.35, 2, "#d4a017");
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(hx + 2, by + 2, bw - 4, bh * 0.35 - 4);
    return;
  }

  if (kind === "billboard") {
    roundRect(hx, by - 2, bw, bh + 4, 3, "#1e293b");
    roundRect(hx + 4, by + 2, bw - 8, bh - 4, 2, "#ec4899");
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `bold ${Math.max(9, bh * 0.45)}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("AD", hx + bw / 2, by + bh * 0.72);
    return;
  }

  // balcony default
  roundRect(hx, by, bw, bh, 5, "#64748b");
  roundRect(hx + 3, by + 3, bw - 6, bh * 0.45, 3, "#94a3b8");
  ctx.fillStyle = "#334155";
  for (let i = 0; i < 4; i++) {
    const rx = hx + 6 + i * ((bw - 12) / 3.5);
    ctx.fillRect(rx, by + bh * 0.55, 3, bh * 0.4);
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Side} side
 * @param {boolean} choppingNow
 */
function drawPlayer(x, y, side, choppingNow) {
  const dir = side === "left" ? 1 : -1;

  // hard hat
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.ellipse(x, y - 30, 13, 8, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#d97706";
  ctx.fillRect(x - 14, y - 30, 28, 5);

  // head
  ctx.fillStyle = "#f5c26b";
  ctx.beginPath();
  ctx.arc(x, y - 22, 10, 0, Math.PI * 2);
  ctx.fill();

  // vest / body
  roundRect(x - 12, y - 12, 24, 26, 5, "#f97316");
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(x - 3, y - 10, 6, 22);
  // reflective stripe
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(x - 12, y, 24, 3);

  // pants
  roundRect(x - 11, y + 12, 22, 12, 3, "#1e293b");

  // hammer arm
  ctx.strokeStyle = "#f5c26b";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  if (choppingNow) {
    ctx.lineTo(x + dir * 26, y - 24);
  } else {
    ctx.lineTo(x + dir * 16, y);
  }
  ctx.stroke();

  // hammer head
  const hx = choppingNow ? x + dir * 28 : x + dir * 18;
  const hy = choppingNow ? y - 26 : y - 2;
  ctx.fillStyle = "#475569";
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(choppingNow ? dir * -0.6 : dir * 0.2);
  roundRect(-7, -5, 14, 10, 2, "#64748b");
  ctx.fillStyle = "#334155";
  ctx.fillRect(-2, 4, 4, 10);
  ctx.restore();

  // boots
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x - 12, y + 22, 10, 5);
  ctx.fillRect(x + 2, y + 22, 10, 5);
}

function spawnDebris(cx, baseY, trunkW, segH, side) {
  const dir = side === "left" ? -1 : 1;
  debris.push({
    x: cx,
    y: baseY - segH,
    vx: dir * (4 + Math.random() * 3),
    vy: -2 - Math.random() * 2,
    rot: 0,
    vr: dir * 0.12,
    life: 1,
    kind: "beam",
    side,
  });
  for (let i = 0; i < 5; i++) {
    sparks.push({
      x: cx + (Math.random() - 0.5) * trunkW,
      y: baseY - segH * 0.5,
      r: 1.5 + Math.random() * 2.5,
      a: 1,
      vy: -1 - Math.random() * 3,
    });
  }
}

function spawnFloat(x, y, text) {
  floats.push({ x, y, vy: -1.4, life: 1, text });
}

function draw(now) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const trunkW = Math.min(52, w * 0.15);
  const segH = Math.min(52, (h * 0.55) / SEGMENTS);
  const baseY = h * 0.82;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;

  drawSkyline(w, h, baseY);

  // Steel / concrete tower segments
  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const y = baseY - (i + 1) * segH + shakeX * 0.15;
    const x = cx - trunkW / 2 + shakeX;
    const shade = i % 2 === 0 ? "#6b7280" : "#4b5563";
    roundRect(x, y, trunkW, segH + 1, 3, shade);
    // rivet / girder detail
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(x + 4, y + 4, 3, segH - 8);
    ctx.fillRect(x + trunkW - 7, y + 4, 3, segH - 8);
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + segH * 0.5);
    ctx.lineTo(x + trunkW - 8, y + segH * 0.5);
    ctx.stroke();
    // neon edge accent
    ctx.fillStyle = i % 3 === 0 ? "rgba(236, 72, 153, 0.45)" : "rgba(56, 189, 248, 0.25)";
    ctx.fillRect(x + trunkW * 0.4, y + 2, 3, segH - 4);

    const cell = trunk[i];
    if (cell?.side) {
      drawHazard(x, y, trunkW, segH, cell.side, cell.kind);
    }
  }

  // Player
  const playerY = baseY - segH * 0.15;
  const px =
    playerSide === "left" ? cx - trunkW / 2 - 38 : cx + trunkW / 2 + 38;
  const chopLift = chopping && now < chopUntil ? 8 : 0;
  drawPlayer(px + shakeX * 0.4, playerY - chopLift, playerSide, chopping && now < chopUntil);

  // Soft reflection
  ctx.globalAlpha = 0.18;
  ctx.save();
  ctx.translate(px + shakeX * 0.4, baseY + 6);
  ctx.scale(1, -0.35);
  drawPlayer(0, -playerY + baseY + chopLift, playerSide, false);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 8, trunkW * 0.95, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Debris
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.max(0, d.life);
    roundRect(-trunkW / 2, 0, trunkW, segH * 0.85, 3, "#6b7280");
    ctx.restore();
  }

  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.a);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Large run score (ref rhythm — big number above the tower)
  if (phase === "playing" || phase === "over") {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.min(56, w * 0.14)}px Manrope, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4;
    const sy = h * 0.14;
    ctx.strokeText(String(score), cx, sy);
    ctx.fillText(String(score), cx, sy);
    ctx.restore();
  }

  // Floating +N
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = "#fff";
    ctx.font = "800 22px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

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

  const danger = trunk[0]?.side ?? null;
  if (danger && danger === side) {
    endGame("To‘siq urildi!");
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const cx = w * 0.5;
  const trunkW = Math.min(52, w * 0.15);
  const segH = Math.min(52, (h * 0.55) / SEGMENTS);
  const baseY = h * 0.82;
  spawnDebris(cx, baseY, trunkW, segH, side);
  spawnFloat(
    side === "left" ? cx - 40 : cx + 40,
    baseY - segH * 1.2,
    "+1",
  );

  trunk.shift();
  let next = randomHazard();
  const top = trunk[trunk.length - 1];
  if (next.side && top?.side && next.side === top.side && Math.random() < 0.45) {
    next = {
      side: next.side === "left" ? "right" : "left",
      kind: next.kind,
    };
  }
  trunk.push(next);

  score += 1;
  hudScore.textContent = String(score);
  energy = Math.min(ENERGY_MAX, energy + ENERGY_REFILL);
  multiFill = Math.min(1, multiFill + MULTI_GAIN);
  multi = Math.min(MULTI_MAX, 1 + multiFill * (MULTI_MAX - 1));
  setEnergyUi();
  setMultiUi();
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

  for (const d of debris) {
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 18 * dt;
    d.rot += d.vr;
    d.life -= dt * 1.1;
  }
  debris = debris.filter((d) => d.life > 0);

  for (const s of sparks) {
    s.y += s.vy;
    s.vy += 10 * dt;
    s.a -= dt * 1.8;
  }
  sparks = sparks.filter((s) => s.a > 0);

  for (const f of floats) {
    f.y += f.vy;
    f.life -= dt * 1.2;
  }
  floats = floats.filter((f) => f.life > 0);

  draw(ts);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
resize();
seedTrunk();
showOverlay(
  "City Strike",
  "Chap yoki o‘ng tomonga bosing. To‘siq siz tomonda bo‘lsa — ehtiyot!",
  "O‘ynash",
);
void loadBest();
requestAnimationFrame(loop);
