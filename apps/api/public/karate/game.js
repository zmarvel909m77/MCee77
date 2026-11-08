/**
 * Karate Strike — Timberman-style chop arcade.
 * Tap left/right to chop. Same-side branch = game over.
 * 1 successful chop = 1 stored point. High score only on server.
 * Hero: user sprite atlas (cap / white tee / baggy pants) — idle, walk,
 * Tepish kick, punch, hurt → Mag‘lubiyat defeat.
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

/**
 * Sync CSS --app-height to Telegram's stable viewport (avoids 100vh drift)
 * and prefer WebApp safe-area insets when CSS env() reports 0.
 */
function syncAppHeight() {
  const px =
    (tg && (tg.viewportStableHeight || tg.viewportHeight)) ||
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight;
  if (px > 0) {
    document.documentElement.style.setProperty("--app-height", `${Math.round(px)}px`);
  }
  const insetBottom = Math.max(
    Number(tg?.safeAreaInset?.bottom) || 0,
    Number(tg?.contentSafeAreaInset?.bottom) || 0,
  );
  if (insetBottom > 0) {
    document.documentElement.style.setProperty(
      "--safe-bottom",
      `${Math.round(insetBottom)}px`,
    );
  }
}

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
  syncAppHeight();
} else {
  syncAppHeight();
}

/** @typedef {"left"|"right"|null} Side */
/** @typedef {"ready"|"playing"|"paused"|"dying"|"over"} Phase */
/** @typedef {"idle"|"walk"|"kick"|"punch"|"hurt"|"defeat"} HeroPose */

/**
 * Hero on-screen height (idle). Each trunk segment is taller again
 * (hero + ~50px+) so blocks read long like the ref.
 */
const HERO_DRAW_H = 78;
/** Extra height above hero for one trunk block (uzunlashsin). */
const SEG_OVER_HERO = 52;
/**
 * Live segment count — derived in layout() so tall blocks still fill
 * ground → canvas top. Starts at 5; resized when the canvas lays out.
 */
let SEGMENTS = 5;
const ENERGY_MAX = 100;
/** Base drain/sec — ramps with score so opening feels fair, later snappy. */
const ENERGY_DRAIN = 11;
const ENERGY_REFILL = 18;
/** Strike hold — long enough to read Tepish kick + swoosh. */
const CHOP_MS = 160;
/** Side-switch flash through walk frames before/with kick. */
const WALK_MS = 95;
const HURT_MS = 380;
const DEFEAT_HOLD_MS = 520;
const MULTI_DECAY = 0.55;
const MULTI_GAIN = 0.14;
const MULTI_MAX = 2.5;

/** Sprite atlas — feet-anchored frames facing right (mirror for right side). */
const HERO_ATLAS = {
  image: "./hero-atlas.png",
  face: "right",
  nativeH: 160,
  frames: {
    idle: { x: 2, y: 2, w: 90, h: 160 },
    walk0: { x: 94, y: 2, w: 117, h: 160 },
    walk1: { x: 213, y: 2, w: 118, h: 160 },
    walk2: { x: 333, y: 2, w: 117, h: 160 },
    walk3: { x: 452, y: 2, w: 163, h: 160 },
    punch: { x: 617, y: 2, w: 168, h: 160 },
    kick: { x: 787, y: 2, w: 143, h: 160 },
    slam: { x: 2, y: 164, w: 194, h: 160 },
    front: { x: 198, y: 164, w: 79, h: 160 },
    back: { x: 279, y: 164, w: 69, h: 160 },
    crouch: { x: 350, y: 164, w: 131, h: 160 },
    jump: { x: 483, y: 164, w: 109, h: 160 },
    hurt: { x: 594, y: 164, w: 191, h: 160 },
    defeat: { x: 787, y: 164, w: 140, h: 65 },
  },
};

const heroImg = new Image();
let heroReady = false;
heroImg.onload = () => {
  heroReady = true;
};
heroImg.onerror = () => {
  heroReady = false;
};
heroImg.src = HERO_ATLAS.image;

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
/** @type {HeroPose} */
let heroPose = "idle";
/** Strike flavor for this chop — prefer kick (Tepish). */
/** @type {"kick"|"punch"} */
let strikeKind = "kick";
let walkUntil = 0;
let walkStartedAt = 0;
let deathStartedAt = 0;
let pendingOverReason = "";
let lastTs = 0;
let submitting = false;
let lastSubmitted = false;
let shake = 0;
let muted = false;
let animT = 0;
/** Grace seconds after start before timer pressure. */
let graceLeft = 0;
/** Alternate punch occasionally so sheet punch+stars also appear. */
let strikeCount = 0;

/**
 * Flying split-log chunks (bo‘linish).
 * @type {{ x: number, y: number, vx: number, vy: number, rot: number, vr: number, life: number, w: number, h: number, branch: Side }[]}
 */
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
 * Every segment carries exactly one branch (left OR right).
 * Never both sides on one height (Side is single-valued) — always one safe side.
 * Mix of stay / switch so the run stays fair (no forced death).
 * @param {number} runScore
 * @param {Side} prevSide
 * @returns {"left"|"right"}
 */
function nextBranch(runScore, prevSide) {
  // Prefer switching as score climbs; still allow same-side runs
  const switchChance = Math.min(0.82, 0.48 + runScore * 0.007);
  if (prevSide === "left" || prevSide === "right") {
    if (Math.random() < switchChance) {
      return prevSide === "left" ? "right" : "left";
    }
    return prevSide;
  }
  return Math.random() < 0.5 ? "left" : "right";
}

/**
 * Opening queue: every slot has a branch. Player starts on the right, so
 * trunk[0] is "left" (safe). Then gentle L/R with occasional doubles.
 */
function seedTrunk() {
  /** @type {Side[]} */
  const pattern = [];
  // Fair start — bottom hazard opposite the default stand side
  let side = /** @type {"left"|"right"} */ ("left");
  for (let i = 0; i < SEGMENTS; i++) {
    pattern.push(side);
    // Early: often switch; sprinkle a same-side beat for readability
    if (i === 0 || Math.random() < 0.65) {
      side = side === "left" ? "right" : "left";
    }
  }
  trunk = pattern;
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
  heroPose = "idle";
  strikeKind = "kick";
  walkUntil = 0;
  walkStartedAt = 0;
  deathStartedAt = 0;
  pendingOverReason = "";
  strikeCount = 0;
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
  syncAppHeight();
  // CSS grid owns the box (100% of minmax(0,1fr) cell). Do NOT size the
  // canvas to #wrap — that overflowed HUD+hint and hid the ground strip.
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const w = Math.max(1, Math.floor(canvas.clientWidth));
  const h = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
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

  // Dark reflective ground strip (~1 cm / 40–48 CSS px above canvas bottom)
  const ground = ctx.createLinearGradient(0, baseY, 0, h);
  ground.addColorStop(0, "#2a1438");
  ground.addColorStop(0.2, "#1a0c24");
  ground.addColorStop(0.55, "#100818");
  ground.addColorStop(1, "#07040c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, baseY, w, Math.max(0, h - baseY));

  // Horizon rim — makes the ground plane readable against pink sky
  ctx.fillStyle = "rgba(255, 200, 220, 0.28)";
  ctx.fillRect(0, baseY - 1, w, 3);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, baseY + 2, w, 4);

  // Reflection streaks
  ctx.strokeStyle = "rgba(255, 200, 220, 0.1)";
  ctx.lineWidth = 1.5;
  const groundSpan = Math.max(8, h - baseY);
  for (let i = 0; i < 5; i++) {
    const gy = baseY + 8 + i * Math.min(11, groundSpan / 5);
    if (gy >= h - 2) break;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, gy);
    ctx.lineTo(w * 0.92, gy + (i % 2) * 2);
    ctx.stroke();
  }

  // Foreground bush silhouettes — rooted on the ground plane (not past the fold)
  ctx.fillStyle = "#0c0614";
  const bushY = Math.min(h, baseY + Math.max(10, (h - baseY) * 0.55));
  drawBush(w * 0.12, bushY, 50);
  drawBush(w * 0.88, bushY, 56);
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
/**
 * Branch plank flush with the TOP seam of its segment (ref).
 * @param {number} x segment left
 * @param {number} y segment top
 * @param {number} trunkW
 * @param {number} segH
 * @param {Side} side
 */
function drawBranch(x, y, trunkW, segH, side) {
  // Top-aligned: plank flush with the upper seam of the block (ref)
  const bh = Math.min(18, Math.max(12, segH * 0.12));
  const by = y; // exact top edge
  const bw = trunkW * 2.15; // longer plank so thin trunk still reads
  const left = side === "left";
  const hx = left ? x - bw + 4 : x + trunkW - 4;
  // Wooden plank — same family as trunk
  roundRect(hx, by, bw, bh, 4, "#a67c52");
  // grain
  ctx.strokeStyle = "rgba(70, 40, 20, 0.28)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const gy = by + 4 + i * (bh / 2.4);
    ctx.beginPath();
    ctx.moveTo(hx + 6, gy);
    ctx.lineTo(hx + bw - 6, gy + (i % 2));
    ctx.stroke();
  }
  // dark edge near trunk
  ctx.fillStyle = "rgba(60, 30, 15, 0.28)";
  if (left) ctx.fillRect(hx + bw - 8, by, 8, bh);
  else ctx.fillRect(hx, by, 8, bh);
}

/**
 * Resolve which atlas frame key to draw for the current hero pose / time.
 * @param {number} now
 * @returns {string}
 */
function heroFrameKey(now) {
  if (phase === "dying" || (phase === "over" && deathStartedAt)) {
    const elapsed = now - deathStartedAt;
    if (elapsed < HURT_MS) return "hurt";
    return "defeat";
  }
  if (chopping && now < chopUntil) {
    // Side switch: brief walk cycle, then Tepish / punch
    if (now < walkUntil) {
      const t = (now - walkStartedAt) / Math.max(1, WALK_MS);
      const idx = Math.min(3, Math.floor(t * 4));
      return `walk${idx}`;
    }
    return strikeKind === "punch" ? "punch" : "kick";
  }
  if (now < walkUntil) {
    const t = (now - walkStartedAt) / Math.max(1, WALK_MS);
    const idx = Math.min(3, Math.floor(t * 4));
    return `walk${idx}`;
  }
  return "idle";
}

/**
 * Draw hero from sprite atlas. `y` is feet baseline. Faces trunk.
 * @param {number} x
 * @param {number} y
 * @param {Side} side
 * @param {number} now
 * @param {number} [scaleMul]
 */
function drawPlayer(x, y, side, now, scaleMul = 1) {
  const faceRight = side === "left"; // left of trunk → face right
  const key = heroFrameKey(now);
  const fr = HERO_ATLAS.frames[key] || HERO_ATLAS.frames.idle;

  // Target on-screen height — trunk blocks are taller (HERO_DRAW_H + SEG_OVER_HERO)
  const targetH =
    key === "defeat" ? 28 * scaleMul : HERO_DRAW_H * scaleMul;
  const scale = targetH / fr.h;
  const dw = fr.w * scale;
  const dh = fr.h * scale;

  // Subtle idle breath; strike lifts slightly toward trunk
  let bob = 0;
  let lift = 0;
  if (key === "idle") bob = Math.sin(animT * 3.2) * 1.4;
  if (key === "kick" || key === "punch") lift = 5;
  if (key === "hurt") lift = 10;

  const feetY = y + bob;
  const drawX = x;
  const drawY = feetY - dh - (key === "defeat" ? -2 : 0) - lift;

  // shadow under feet
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  const shadowW = key === "defeat" ? dw * 0.45 : Math.min(22, dw * 0.28);
  ctx.ellipse(drawX, feetY + 2, shadowW, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!heroReady) {
    // Minimal placeholder only until atlas loads — never red-gi
    ctx.fillStyle = "#f5f5f5";
    roundRect(drawX - 12, feetY - 56, 24, 56, 6, "#f5f5f5");
    ctx.fillStyle = "#111";
    roundRect(drawX - 10, feetY - 70, 20, 14, 3, "#111");
    return;
  }

  ctx.save();
  if (faceRight) {
    // native atlas faces right
    ctx.translate(drawX - dw / 2, drawY);
    ctx.drawImage(
      heroImg,
      fr.x,
      fr.y,
      fr.w,
      fr.h,
      0,
      0,
      dw,
      dh,
    );
  } else {
    // mirror for right side of trunk
    ctx.translate(drawX + dw / 2, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(
      heroImg,
      fr.x,
      fr.y,
      fr.w,
      fr.h,
      0,
      0,
      dw,
      dh,
    );
  }
  ctx.restore();
}

/**
 * Spawn a trunk-width flying split log (bo‘linish) opposite the hero,
 * down-diagonal like the GAMEE ref, plus wood chips.
 * @param {number} cx
 * @param {number} baseY
 * @param {number} trunkW
 * @param {number} segH
 * @param {Side} side hero kick side
 * @param {Side} [branch] branch attached to the chopped segment
 */
function spawnDebris(cx, baseY, trunkW, segH, side, branch = null) {
  // Opposite the hero — right kick → chunk flies left-down
  const dir = side === "left" ? 1 : -1;
  debris.push({
    x: cx,
    y: baseY - segH * 0.55,
    vx: dir * (7.5 + Math.random() * 4.5),
    vy: 1.8 + Math.random() * 2.4,
    rot: dir * 0.45,
    vr: dir * (0.16 + Math.random() * 0.1),
    life: 1.2,
    w: trunkW,
    h: segH,
    branch: branch || null,
  });
  for (let i = 0; i < 12; i++) {
    chips.push({
      x: cx + (Math.random() - 0.5) * trunkW * 1.1,
      y: baseY - segH * (0.3 + Math.random() * 0.5),
      r: 1.4 + Math.random() * 3.2,
      a: 1,
      vy: -0.5 + Math.random() * 4,
      vx: dir * (2 + Math.random() * 5) + (Math.random() - 0.5) * 2,
    });
  }
}

function spawnFloat(x, y, text) {
  floats.push({ x, y, vy: -1.5, life: 1, text });
}

/** Dark reflective ground strip ≈ 1 cm on phone (~40–48 CSS px). */
const GROUND_MIN = 40;
const GROUND_MAX = 48;

function layout() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const cx = w * 0.5;
  // Thinner pole (ingichkaroq) — branches still top-mounted on each block
  const trunkW = Math.min(46, Math.max(40, w * 0.115));
  // Keep ~1cm ground visible above the canvas bottom (shell already clears
  // safe-area / home indicator via padding-bottom + --app-height).
  const groundH = Math.max(
    GROUND_MIN,
    Math.min(GROUND_MAX, Math.round(h * 0.09)),
  );
  const baseY = Math.max(groundH + 80, h - groundH);
  // Even taller blocks; count fills ground → canvas top
  const minSegH = HERO_DRAW_H + SEG_OVER_HERO;
  const nextSegs = Math.max(4, Math.floor(baseY / minSegH));
  const segH = baseY / nextSegs;
  if (nextSegs !== SEGMENTS) {
    SEGMENTS = nextSegs;
    while (trunk.length < SEGMENTS) {
      const prev = trunk[trunk.length - 1];
      trunk.push(
        prev === "left" ? "right" : prev === "right" ? "left" : "left",
      );
    }
    if (trunk.length > SEGMENTS) trunk.length = SEGMENTS;
  }
  return { w, h, cx, trunkW, segH, baseY, groundH, segments: SEGMENTS };
}

function draw(now) {
  const { w, h, cx, trunkW, segH, baseY } = layout();
  ctx.clearRect(0, 0, w, h);

  if (petals.length === 0) seedPetals(w, h);

  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  drawAtmosphere(w, h, baseY);

  // Trunk — continuous pole (ground → canvas top), ref-like cylindrical wood
  const trunkX = cx - trunkW / 2 + shakeX;
  // Base fill so the pole never stops mid-screen
  ctx.fillStyle = "#c49a6c";
  ctx.fillRect(trunkX, 0, trunkW, baseY + 1);
  // Cylindrical side shading (darker outer edges)
  ctx.fillStyle = "rgba(90, 50, 22, 0.22)";
  ctx.fillRect(trunkX, 0, 7, baseY + 1);
  ctx.fillRect(trunkX + trunkW - 8, 0, 8, baseY + 1);
  // Soft left highlight strip
  ctx.fillStyle = "rgba(255, 230, 190, 0.2)";
  ctx.fillRect(trunkX + 8, 0, 5, baseY);

  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const y = baseY - (i + 1) * segH + shakeX * 0.12;
    const x = trunkX;
    // Subtle alternating block shade
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(196, 154, 108, 0.35)";
      ctx.fillRect(x, y, trunkW, segH + 1.5);
    }
    // Vertical grain
    ctx.strokeStyle = "rgba(90, 50, 25, 0.2)";
    ctx.lineWidth = 1.35;
    for (let g = 0; g < 4; g++) {
      const gx = x + 10 + g * ((trunkW - 20) / 3.2);
      ctx.beginPath();
      ctx.moveTo(gx, y + 6);
      ctx.lineTo(gx + (g % 2 ? 1.4 : -1), y + segH - 4);
      ctx.stroke();
    }
    // Top seam of this block — branch attaches here (ref)
    ctx.strokeStyle = "rgba(55, 28, 10, 0.38)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 1);
    ctx.lineTo(x + trunkW - 3, y + 1);
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

  // Player — feet on stump ledge; close enough for kick to read as trunk hit
  const playerY = baseY + 2;
  const sideGap = Math.max(32, trunkW * 0.52 + 10);
  const px =
    playerSide === "left" ? cx - trunkW / 2 - sideGap : cx + trunkW / 2 + sideGap;
  drawPlayer(px + shakeX * 0.35, playerY, playerSide, now);

  // Soft reflection of player
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.translate(0, baseY + 6);
  ctx.scale(1, -0.3);
  drawPlayer(px + shakeX * 0.35, -(playerY - baseY) + 4, playerSide, now, 0.92);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Debris — trunk-width flying split log (bo‘linish)
  for (const d of debris) {
    const dw = d.w || trunkW;
    const dh = d.h || segH * 0.9;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
    roundRect(-dw / 2, -dh / 2, dw, dh, 4, "#c49a6c");
    // grain on flying chunk
    ctx.strokeStyle = "rgba(90, 50, 25, 0.28)";
    ctx.lineWidth = 1.3;
    for (let g = 0; g < 3; g++) {
      const gx = -dw / 2 + 8 + g * ((dw - 16) / 2.5);
      ctx.beginPath();
      ctx.moveTo(gx, -dh / 2 + 4);
      ctx.lineTo(gx + (g % 2 ? 1.2 : -1), dh / 2 - 4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 230, 190, 0.16)";
    ctx.fillRect(-dw / 2 + 3, -dh / 2 + 2, 5, dh - 4);
    if (d.branch) {
      drawBranch(-dw / 2, -dh / 2, dw, dh, d.branch);
    }
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
  if (
    phase === "playing" ||
    phase === "paused" ||
    phase === "dying" ||
    phase === "over"
  ) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.min(68, w * 0.17);
    ctx.font = `800 ${fontSize}px Manrope, sans-serif`;
    // Large run score sits mid-upper on the tall pole (ref rhythm)
    const sy = Math.max(segH * 2.2, baseY * 0.28);
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
  const now = performance.now();
  if (chopping && now < chopUntil) return;

  const switched = playerSide != null && playerSide !== side;
  playerSide = side;
  chopping = true;
  chopUntil = now + CHOP_MS;
  strikeCount += 1;
  // Prefer Tepish kick; every 4th hit shows punch + impact stars from sheet
  strikeKind = strikeCount % 4 === 0 ? "punch" : "kick";
  heroPose = strikeKind;
  if (switched) {
    walkStartedAt = now;
    walkUntil = now + WALK_MS;
    heroPose = "walk";
  }

  const danger = trunk[0];
  if (danger && danger === side) {
    endGame("Novda urildi!");
    return;
  }

  const { cx, trunkW, segH, baseY } = layout();
  // Chopped segment flies away (branch rides along if present on opposite side)
  const choppedBranch = danger;
  spawnDebris(cx, baseY, trunkW, segH, side, choppedBranch);
  // Visual feedback +1 — DB contract is 1 hit = 1 point
  spawnFloat(cx + (side === "left" ? -8 : 8), baseY - segH * 1.35, "+1");

  trunk.shift();
  /** @type {Side} */
  const prev = trunk[trunk.length - 1] ?? "left";
  trunk.push(nextBranch(score + 1, prev));

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
  if (phase === "over" || phase === "dying") return;
  phase = "dying";
  chopping = false;
  walkUntil = 0;
  shake = 12;
  deathStartedAt = performance.now();
  heroPose = "hurt";
  pendingOverReason = reason || "Yana urinib ko‘ring!";
  // Overlay + score submit wait until Mag‘lubiyat pose lands (see loop)
}

function finishDeathSequence() {
  if (phase !== "dying") return;
  phase = "over";
  heroPose = "defeat";
  showOverlay(
    "O‘yin tugadi",
    pendingOverReason || "Yana urinib ko‘ring!",
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
  if (phase === "paused" || phase === "dying") return;
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
    else if (phase === "ready" || phase === "over") startGame();
  } else if (ev.key === "p" || ev.key === "P") {
    if (phase !== "dying") togglePause();
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

  if (phase === "playing" && !shotFreeze) {
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

  // Hurt → Mag‘lubiyat before game-over card — no snap-cut
  if (phase === "dying") {
    const elapsed = ts - deathStartedAt;
    if (elapsed >= HURT_MS) heroPose = "defeat";
    if (elapsed >= HURT_MS + DEFEAT_HOLD_MS) finishDeathSequence();
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

  if (phase !== "paused" && !shotFreeze) {
    for (const d of debris) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 22 * dt;
      d.vx *= 0.995;
      d.rot += d.vr;
      d.life -= dt * 0.95;
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

function onViewportResize() {
  syncAppHeight();
  resize();
  petals = [];
}

window.addEventListener("resize", onViewportResize);
window.visualViewport?.addEventListener("resize", onViewportResize);
if (tg && typeof tg.onEvent === "function") {
  tg.onEvent("viewportChanged", onViewportResize);
}

syncAppHeight();
resize();
// Second pass after first layout — clientHeight can be 0 on the first tick.
requestAnimationFrame(() => {
  resize();
  layout(); // sync SEGMENTS before seeding
  seedTrunk();
});
layout();
seedTrunk();
showOverlay(
  "Karate Strike",
  "Chap yoki o‘ng tomonga bosing. Novda siz tomonda bo‘lsa — ehtiyot!",
  "O‘ynash",
);
void loadBest();
requestAnimationFrame(loop);

const urlParams = new URLSearchParams(location.search);
/** QA harness freezes VFX / energy so screenshots stay mid-kick. */
let shotFreeze = false;

// Optional smart bot for demos: /karate/?bot=1
if (urlParams.get("bot") === "1") {
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

// Screenshot / QA harness: /karate/?shot=idle|kick|defeat|tree|split
if (urlParams.has("shot")) {
  window.__karateShot = {
    ready: () => heroReady,
    layout: () => layout(),
    trunk: () => trunk.slice(),
    debrisCount: () => debris.length,
    floatsCount: () => floats.length,
    show(pose) {
      hideOverlay();
      phase = "playing";
      shotFreeze = true;
      score = Math.max(score, 12);
      hudScore.textContent = String(score);
      playerSide = "right";
      chopping = false;
      chopUntil = 0;
      walkUntil = 0;
      deathStartedAt = 0;
      heroPose = "idle";
      debris = [];
      floats = [];
      chips = [];
      if (pose === "kick" || pose === "split") {
        playerSide = "left";
        chopping = true;
        strikeKind = "kick";
        chopUntil = performance.now() + 60_000;
        heroPose = "kick";
      } else if (pose === "defeat") {
        phase = "dying";
        deathStartedAt = performance.now() - HURT_MS - 50;
        heroPose = "defeat";
        shotFreeze = false;
      } else {
        heroPose = "idle";
      }
      if (pose === "tree" || pose === "split") {
        resize();
        const L0 = layout(); // sync SEGMENTS to tall-block count
        // Every segment has a top-mounted branch (L/R alternate)
        const n = L0.segments;
        trunk = [];
        // Bottom opposite the hero stand side (fair / readable)
        const bottom = pose === "split" ? "right" : "left";
        for (let i = 0; i < n; i++) {
          trunk.push(
            i % 2 === 0
              ? bottom
              : bottom === "left"
                ? "right"
                : "left",
          );
        }
      }
      if (pose === "split") {
        resize();
        const L = layout();
        // Mid-flight split log opposite hero (hero left → chunk flies right-down)
        spawnDebris(L.cx, L.baseY, L.trunkW, L.segH, "left", "right");
        if (debris[0]) {
          debris[0].x = L.cx + L.trunkW * 1.45;
          debris[0].y = L.baseY - L.segH * 0.35;
          debris[0].vx = 0;
          debris[0].vy = 0;
          debris[0].rot = 0.55;
          debris[0].vr = 0;
          debris[0].life = 1;
        }
        chips = chips.slice(0, 5).map((c, i) => ({
          ...c,
          x: L.cx + 22 + i * 9,
          y: L.baseY - L.segH * 0.35 - i * 7,
          vx: 0,
          vy: 0,
          a: 1,
        }));
        spawnFloat(L.cx + 10, L.baseY - L.segH * 0.85, "+1");
        if (floats[0]) {
          floats[0].vy = 0;
          floats[0].life = 1;
        }
        return;
      }
      resize();
    },
  };
  const waitHero = () => {
    if (!heroReady) {
      requestAnimationFrame(waitHero);
      return;
    }
    window.__karateShot.show(urlParams.get("shot") || "idle");
  };
  requestAnimationFrame(waitHero);
}
