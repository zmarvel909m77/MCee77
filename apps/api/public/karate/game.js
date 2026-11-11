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
 
/* ── Feel / timing targets (2D side-view sprite game) ─────────────── */
/** Target game loop rate (requestAnimationFrame + dt clamp). */
const TARGET_FPS = 60;
/** Max simulation step (seconds) — clamps hitches; ~2 frames @ 60 FPS. */
const DT_MAX = 2 / TARGET_FPS;
/** Hero atlas frame cadence (walk cycle) — mid of 30–60 FPS. */
const SPRITE_FPS = 45;
/** Walk cycle uses 4 atlas frames at SPRITE_FPS. */
const WALK_MS = Math.round((4 / SPRITE_FPS) * 1000);
/** Kick / hit pose hold — mid of 0.08–0.15 s. */
const CHOP_MS = 120;
/** Daraxt ustuni canvas balandligining taxminan 82 foizini egallaydi. */
const TREE_HEIGHT_FRAC = 0.82;
const TREE_HEIGHT_MIN_FRAC = 0.82;
const TREE_HEIGHT_MAX_FRAC = 0.82;
/** Hero height as fraction of tree height (mid of 8–12%). */
const HERO_OF_TREE_FRAC = 0.1;
const HERO_OF_TREE_MIN = 0.08;
const HERO_OF_TREE_MAX = 0.12;
/** One segment settles in this many ms — mid of 0.25–0.6 s; queueable. */
const DROP_DURATION_MS = 280;
const DROP_DURATION_MIN_MS = 250;
const DROP_DURATION_MAX_MS = 600;
/** Debris spin while flying — mid of 90°–180°. */
const DEBRIS_SPIN_DEG_MIN = 90;
const DEBRIS_SPIN_DEG_MAX = 180;
/** Debris gravity (px/s²). */
const DEBRIS_GRAVITY = 980;
/** Dark reflective ground strip ≈ 1 cm on phone (~40–48 CSS px). */
const GROUND_MIN = 40;
const GROUND_MAX = 48;
 
/**
* Live segment count — derived in layout() from TREE_HEIGHT_FRAC.
* Starts at 5; resized when the canvas lays out.
*/
let SEGMENTS = 5;
const ENERGY_MAX = 100;
/** Base drain/sec — scaled by difficultyFor(score). */
const ENERGY_DRAIN = 11;
/** Base refill per hit — scaled by difficultyFor(score). */
const ENERGY_REFILL = 18;
/** Score below this = easy same-side streaks + forgiving timer. */
const DIFF_EASY_UNTIL = 20;
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
 
// Fon endi Canvas kodlari bilan chiziladi; tashqi background.png talab qilinmaydi.
 
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
let muted = false;
let animT = 0;
/** Grace seconds after start before timer pressure. */
let graceLeft = 0;
/** Alternate punch occasionally so sheet punch+stars also appear. */
let strikeCount = 0;
/**
* Trunk drop after chop: ≤0 px. Stack is drawn raised by this amount so a
* brief gap opens, then eases flush onto the stump (never left hovering).
* Time-based anim so settle always completes even if a frame hitches.
* @type {{ start: number, from: number, duration: number } | null}
*/
let trunkDropAnim = null;
/** Cached sample of trunkDropAnim (updated each frame). */
let trunkDropY = 0;
 
/**
* Flying split-log chunks (bo‘linish).
* @type {{ x: number, y: number, vx: number, vy: number, rot: number, vr: number, life: number, w: number, h: number, branch: Side, grounded?: boolean }[]}
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
* Mulberry32 — deterministic stream from a per-run seed.
* @param {number} seed
* @returns {() => number} in [0, 1)
*/
function createRng(seed) {
 let s = seed >>> 0;
 return function rand() {
   s = (s + 0x6d2b79f5) | 0;
   let t = Math.imul(s ^ (s >>> 15), 1 | s);
   t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
   return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}
 
/**
* TreeBranchController — random fair branch combos with empty gaps.
*
* Empty segments ARE allowed (not every block has a branch).
* Combos of 1–3 consecutive same-side branches; random L/R; random
* gaps between groups; no back-to-back identical combo; new seed each run.
* Never both sides on one height (always one safe side at the player).
*/
const TreeBranchController = {
 seed: 0,
 /** @type {() => number} */
 rand: Math.random,
 /** @type {"EASY"|"MEDIUM"|"HARD"|"EXTREME"} */
 tier: "EASY",
 gapLeft: 0,
 comboLeft: 0,
 /** @type {"left"|"right"|null} */
 comboSide: null,
 /** Last finished combo key e.g. "left:2" */
 lastComboKey: "",
 /** @type {"left"|"right"|null} */
 pendingSide: null,
 pendingLen: 0,
 pendingComboKey: "",
 
 /**
  * @param {number} [seed]
  */
 reset(seed) {
   this.seed =
     seed != null
       ? seed >>> 0
       : (Date.now() ^ ((Math.random() * 0x100000000) >>> 0)) >>> 0;
   this.rand = createRng(this.seed);
   this.tier = "EASY";
   this.gapLeft = 0;
   this.comboLeft = 0;
   this.comboSide = null;
   this.lastComboKey = "";
   this.pendingSide = null;
   this.pendingLen = 0;
   this.pendingComboKey = "";
   this._planNext(0);
 },
 
 /**
  * Map score → difficulty tier.
  * @param {number} score
  * @returns {"EASY"|"MEDIUM"|"HARD"|"EXTREME"}
  */
 tierFor(score) {
   if (score < 15) return "EASY";
   if (score < 40) return "MEDIUM";
   if (score < 80) return "HARD";
   return "EXTREME";
 },
 
 /**
  * Gap + combo-length weights by tier.
  * @param {"EASY"|"MEDIUM"|"HARD"|"EXTREME"} tier
  */
 params(tier) {
   switch (tier) {
     case "EASY":
       // Few branches, large gaps, mostly 1-branch combos
       return {
         gapMin: 2,
         gapMax: 5,
         comboWeights: [0.78, 0.2, 0.02],
         switchBias: 0.55,
       };
     case "MEDIUM":
       return {
         gapMin: 1,
         gapMax: 3,
         comboWeights: [0.42, 0.48, 0.1],
         switchBias: 0.62,
       };
     case "HARD":
       return {
         gapMin: 0,
         gapMax: 2,
         comboWeights: [0.22, 0.48, 0.3],
         switchBias: 0.7,
       };
     default:
       // EXTREME — dense, 1–3 streaks, small gaps
       return {
         gapMin: 0,
         gapMax: 1,
         comboWeights: [0.18, 0.37, 0.45],
         switchBias: 0.78,
       };
   }
 },
 
 /**
  * @param {number[]} weights length 3 → combo lens 1..3
  * @returns {number}
  */
 _pickComboLen(weights) {
   const r = this.rand();
   let acc = 0;
   for (let i = 0; i < weights.length; i++) {
     acc += weights[i];
     if (r < acc) return i + 1;
   }
   return 1;
 },
 
 /**
  * Plan the next empty gap + upcoming combo (not yet started).
  * Avoids repeating the same combo key back-to-back.
  * @param {number} score
  */
 _planNext(score) {
   this.tier = this.tierFor(score);
   const p = this.params(this.tier);
   this.gapLeft =
     p.gapMin + Math.floor(this.rand() * (p.gapMax - p.gapMin + 1));
 
   const lastSide = this.lastComboKey.startsWith("left")
     ? "left"
     : this.lastComboKey.startsWith("right")
       ? "right"
       : null;
 
   // Gap 0 + same side would merge into a streak > 3 — force a switch
   if (this.gapLeft === 0 && lastSide) {
     // Will force opposite side below
   }
 
   let tries = 0;
   let side = /** @type {"left"|"right"} */ ("left");
   let len = 1;
   let key = "";
   do {
     len = this._pickComboLen(p.comboWeights);
     if (this.gapLeft === 0 && lastSide) {
       side = lastSide === "left" ? "right" : "left";
     } else if (lastSide && this.rand() < p.switchBias) {
       side = lastSide === "left" ? "right" : "left";
     } else {
       side = this.rand() < 0.5 ? "left" : "right";
     }
     key = `${side}:${len}`;
     tries += 1;
   } while (key === this.lastComboKey && tries < 10);
 
   this.pendingSide = side;
   this.pendingLen = len;
   this.pendingComboKey = key;
 },
 
 /**
  * Emit the next trunk segment (null | left | right).
  * @param {number} score
  * @returns {Side}
  */
 next(score) {
   this.tier = this.tierFor(score);
 
   if (this.gapLeft > 0) {
     this.gapLeft -= 1;
     return null;
   }
 
   if (this.comboLeft <= 0) {
     // Begin the pending combo
     this.comboSide = this.pendingSide;
     this.comboLeft = this.pendingLen;
     this.lastComboKey = this.pendingComboKey;
   }
 
   const out = this.comboSide;
   this.comboLeft -= 1;
   if (this.comboLeft <= 0) {
     this.comboSide = null;
     this._planNext(score);
   }
   return out;
 },
 
 /**
  * Build opening queue. Fair: player starts on the right → bottom
  * must not be a right-side hazard (empty or left only).
  * @param {number} count
  * @param {number} [score]
  * @returns {Side[]}
  */
 seedQueue(count, score = 0) {
   // Soft opening: at least one empty at the stump
   this.gapLeft = Math.max(this.gapLeft, 1 + Math.floor(this.rand() * 2));
   // First combo prefers left (safe vs default stand-right)
   this.pendingSide = "left";
   this.pendingLen = 1;
   this.pendingComboKey = "left:1";
 
   /** @type {Side[]} */
   const out = [];
   for (let i = 0; i < count; i++) {
     out.push(this.next(score));
   }
   if (out[0] === "right") out[0] = null;
   return out;
 },
};
 
/**
* Timer / energy scale from the same score tiers as TreeBranchController.
* @param {number} runScore
*/
function difficultyFor(runScore) {
 const tier = TreeBranchController.tierFor(runScore);
 const easy = tier === "EASY";
 const t = Math.max(0, runScore - DIFF_EASY_UNTIL);
 const drainScale =
   tier === "EASY"
     ? 0.32 + runScore * 0.01
     : tier === "MEDIUM"
       ? 0.7 + (runScore - 15) * 0.012
       : tier === "HARD"
         ? Math.min(1.45, 1.0 + (runScore - 40) * 0.012)
         : Math.min(1.75, 1.25 + (runScore - 80) * 0.01);
 const refill =
   tier === "EASY"
     ? 28 - runScore * 0.2
     : tier === "MEDIUM"
       ? 22 - (runScore - 15) * 0.12
       : tier === "HARD"
         ? Math.max(13, 18 - (runScore - 40) * 0.1)
         : Math.max(11, 14 - (runScore - 80) * 0.08);
 return { easy, tier, drainScale, refill };
}
 
function seedTrunk() {
 trunk = TreeBranchController.seedQueue(SEGMENTS, score);
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
 trunkDropAnim = null;
 trunkDropY = 0;
 graceLeft = 2.2;
 debris = [];
 floats = [];
 chips = [];
 // New random seed each run → new branch combination plan
 TreeBranchController.reset();
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
 
function drawMountainRange(points, fill, ridge = null) {
 ctx.beginPath();
 ctx.moveTo(0, points[0][1]);
 for (let i = 1; i < points.length; i++) {
   const [x, y] = points[i];
   const prev = points[i - 1];
   const midX = (prev[0] + x) / 2;
   const midY = (prev[1] + y) / 2;
   ctx.quadraticCurveTo(prev[0], prev[1], midX, midY);
 }
 const last = points[points.length - 1];
 ctx.lineTo(last[0], last[1]);
 ctx.lineTo(points[points.length - 1][0], 1e4);
 ctx.lineTo(0, 1e4);
 ctx.closePath();
 ctx.fillStyle = fill;
 ctx.fill();
 
 if (ridge) {
   ctx.beginPath();
   ctx.moveTo(points[0][0], points[0][1]);
   for (let i = 1; i < points.length; i++) {
     ctx.lineTo(points[i][0], points[i][1]);
   }
   ctx.strokeStyle = ridge;
   ctx.lineWidth = 1.4;
   ctx.stroke();
 }
}
 
function drawCloudBand(w, y, scale, color, alpha = 1) {
 ctx.save();
 ctx.globalAlpha = alpha;
 ctx.fillStyle = color;
 const puff = (x, yy, r) => {
   ctx.beginPath();
   ctx.ellipse(x, yy, r * 1.35, r * 0.42, 0, Math.PI, Math.PI * 2);
   ctx.ellipse(x + r * 0.55, yy - r * 0.18, r * 0.72, r * 0.42, 0, Math.PI, Math.PI * 2);
   ctx.ellipse(x - r * 0.55, yy - r * 0.1, r * 0.78, r * 0.38, 0, Math.PI, Math.PI * 2);
   ctx.closePath();
   ctx.fill();
 };
 for (let i = 0; i < 9; i++) {
   const x = (i / 8) * w;
   const yy = y + Math.sin(i * 1.7) * scale * 0.22;
   puff(x, yy, scale * (0.42 + (i % 3) * 0.08));
 }
 ctx.restore();
}
 
function drawForestLine(w, y, height, color, seed = 1) {
 ctx.fillStyle = color;
 ctx.beginPath();
 ctx.moveTo(0, y + height);
 let x = 0;
 let n = 0;
 while (x <= w + 12) {
   const v = Math.abs(Math.sin((n + seed) * 12.9898) * 43758.5453) % 1;
   const treeH = height * (0.28 + v * 0.72);
   const half = height * (0.08 + v * 0.045);
   ctx.lineTo(x, y + height - treeH * 0.48);
   ctx.lineTo(x + half, y + height - treeH);
   ctx.lineTo(x + half * 2, y + height - treeH * 0.48);
   x += half * 2.1;
   n++;
 }
 ctx.lineTo(w, y + height);
 ctx.closePath();
 ctx.fill();
}
 
function drawAtmosphere(w, h, baseY) {
 // Binafsha osmon va pushti shafaq.
 const sky = ctx.createLinearGradient(0, 0, 0, h);
 sky.addColorStop(0, "#21006d");
 sky.addColorStop(0.28, "#5b08a8");
 sky.addColorStop(0.48, "#b20fc4");
 sky.addColorStop(0.62, "#f018bd");
 sky.addColorStop(0.76, "#ff5b9c");
 sky.addColorStop(1, "#260b62");
 ctx.fillStyle = sky;
 ctx.fillRect(0, 0, w, h);
 
 const glow = ctx.createRadialGradient(w * 0.52, h * 0.57, 2, w * 0.52, h * 0.57, w * 0.8);
 glow.addColorStop(0, "rgba(255, 75, 190, 0.55)");
 glow.addColorStop(0.55, "rgba(188, 20, 210, 0.22)");
 glow.addColorStop(1, "rgba(25, 0, 75, 0)");
 ctx.fillStyle = glow;
 ctx.fillRect(0, 0, w, h);
 
 // Uzoqdagi tog‘lar.
 drawMountainRange([
   [0, h * 0.57], [w * 0.12, h * 0.53], [w * 0.24, h * 0.58],
   [w * 0.34, h * 0.49], [w * 0.48, h * 0.57], [w * 0.62, h * 0.55],
   [w * 0.82, h * 0.46], [w, h * 0.52],
 ], "#4a16a7");
 drawMountainRange([
   [0, h * 0.63], [w * 0.17, h * 0.58], [w * 0.31, h * 0.64],
   [w * 0.49, h * 0.57], [w * 0.67, h * 0.62], [w * 0.84, h * 0.55],
   [w, h * 0.59],
 ], "#351078");
 
 // Qorli cho‘qqilar uchun pushti va lavanda qirralar.
 ctx.lineCap = "round";
 ctx.lineJoin = "round";
 const peaks = [
   [w * 0.31, h * 0.49, w * 0.22, h * 0.57, w * 0.40, h * 0.57],
   [w * 0.82, h * 0.46, w * 0.69, h * 0.57, w * 0.98, h * 0.55],
 ];
 for (const [x, y, lx, ly, rx, ry] of peaks) {
   ctx.beginPath();
   ctx.moveTo(lx, ly);
   ctx.lineTo(x, y);
   ctx.lineTo(rx, ry);
   ctx.strokeStyle = "rgba(255, 125, 220, 0.9)";
   ctx.lineWidth = Math.max(2, w * 0.008);
   ctx.stroke();
   ctx.beginPath();
   ctx.moveTo(x, y);
   ctx.lineTo(x - w * 0.035, y + h * 0.035);
   ctx.lineTo(x - w * 0.008, y + h * 0.026);
   ctx.lineTo(x + w * 0.018, y + h * 0.052);
   ctx.strokeStyle = "#ffb2d5";
   ctx.lineWidth = Math.max(2, w * 0.006);
   ctx.stroke();
 }
 
 // Shafaq bulutlari.
 drawCloudBand(w, h * 0.43, Math.max(12, w * 0.055), "#ffb06d", 0.9);
 drawCloudBand(w, h * 0.49, Math.max(10, w * 0.04), "#ff4dbb", 0.72);
 drawCloudBand(w, h * 0.65, Math.max(12, w * 0.05), "#d72bd6", 0.62);
 
 // Tog‘ etagidagi tuman qatlamlari.
 for (let i = 0; i < 5; i++) {
   const y = h * (0.66 + i * 0.045);
   const mist = ctx.createLinearGradient(0, y - 20, 0, y + 34);
   mist.addColorStop(0, "rgba(255, 50, 220, 0)");
   mist.addColorStop(0.5, `rgba(220, 35, 220, ${0.18 - i * 0.018})`);
   mist.addColorStop(1, "rgba(90, 20, 170, 0)");
   ctx.fillStyle = mist;
   ctx.fillRect(0, y - 20, w, 54);
 }
 
 // Old va uzoq qarag‘ayzorlar.
 drawForestLine(w, h * 0.73, h * 0.085, "#25106c", 3);
 drawForestLine(w, h * 0.79, h * 0.095, "#19094e", 8);
 drawForestLine(w, h * 0.84, h * 0.105, "#100638", 13);
 
 // Pastki binafsha soya, o‘yin maydoniga yumshoq o‘tish.
 const lower = ctx.createLinearGradient(0, h * 0.82, 0, h);
 lower.addColorStop(0, "rgba(20, 4, 70, 0)");
 lower.addColorStop(1, "rgba(20, 5, 65, 0.96)");
 ctx.fillStyle = lower;
 ctx.fillRect(0, h * 0.82, w, h * 0.18);
 
 // Yer platformasi.
 const ground = ctx.createLinearGradient(0, baseY, 0, h);
 ground.addColorStop(0, "#351044");
 ground.addColorStop(0.2, "#1b092c");
 ground.addColorStop(1, "#08030f");
 ctx.fillStyle = ground;
 ctx.fillRect(0, baseY, w, Math.max(0, h - baseY));
 ctx.fillStyle = "rgba(255, 75, 230, 0.75)";
 ctx.fillRect(0, baseY - 2, w, 3);
 ctx.fillStyle = "rgba(15, 3, 28, 0.85)";
 ctx.fillRect(0, baseY + 3, w, 5);
 
 ctx.strokeStyle = "rgba(255, 55, 230, 0.25)";
 ctx.lineWidth = 1.5;
 for (let i = 0; i < 5; i++) {
   const gy = baseY + 10 + i * 9;
   if (gy >= h - 2) break;
   ctx.beginPath();
   ctx.moveTo(w * 0.04, gy);
   ctx.lineTo(w * 0.96, gy);
   ctx.stroke();
 }
 
 // Harakatlanuvchi barglar.
 ctx.fillStyle = "rgba(12, 2, 35, 0.72)";
 for (const p of petals) {
   ctx.save();
   ctx.translate(p.x, p.y);
   ctx.rotate(p.rot);
   ctx.beginPath();
   ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2);
   ctx.fill();
   ctx.restore();
 }
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
 
 // Hero height = HERO_OF_TREE_FRAC × tree height (layout)
 const { heroH } = layout();
 const targetH =
   key === "defeat" ? heroH * 0.4 * scaleMul : heroH * scaleMul;
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
* Spawn compact flying wood chunks (ixcham) opposite the hero — not
* full trunk-width slabs — plus a few chips.
* @param {number} cx
* @param {number} baseY
* @param {number} trunkW
* @param {number} segH
* @param {Side} side hero kick side
* @param {Side} [branch] branch attached to the primary chunk
*/
/**
* Angular velocity (rad/s) so a chunk rotates ~DEBRIS_SPIN_DEG over ~lifeSec.
* @param {number} dir
* @param {number} lifeSec
*/
function debrisSpinRate(dir, lifeSec) {
 const deg =
   DEBRIS_SPIN_DEG_MIN +
   Math.random() * (DEBRIS_SPIN_DEG_MAX - DEBRIS_SPIN_DEG_MIN);
 return dir * ((deg * Math.PI) / 180) / Math.max(0.35, lifeSec);
}
 
function spawnDebris(cx, baseY, trunkW, segH, side, branch = null) {
 // Opposite the hero — right kick → chunk flies left-down
 const dir = side === "left" ? 1 : -1;
 const chunkW = trunkW * 0.48;
 const chunkH = Math.min(26, Math.max(16, segH * 0.16));
 const mk = (scale, life, withBranch) => {
   const w = chunkW * scale;
   const h = chunkH * scale;
   return {
     x: cx + dir * (4 + Math.random() * 6),
     y: baseY - segH * (0.3 + Math.random() * 0.25),
     vx: dir * (180 + Math.random() * 140), // px/s
     vy: -(40 + Math.random() * 80),
     rot: dir * 0.2,
     vr: debrisSpinRate(dir * (Math.random() < 0.5 ? 1 : -1), life),
     life,
     w,
     h,
     branch: withBranch ? branch || null : null,
     grounded: false,
   };
 };
 debris.push(mk(1, 1.15, true));
 debris.push(mk(0.72, 1.0, false));
 debris.push(mk(0.45, 0.85, false));
 for (let i = 0; i < 7; i++) {
   chips.push({
     x: cx + (Math.random() - 0.5) * trunkW,
     y: baseY - segH * (0.25 + Math.random() * 0.4),
     r: 1.1 + Math.random() * 2.2,
     a: 1,
     vy: -40 + Math.random() * 120,
     vx: dir * (60 + Math.random() * 140) + (Math.random() - 0.5) * 40,
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
 // Thinner pole (ingichkaroq) — branches still top-mounted on each block
 const trunkW = Math.min(46, Math.max(40, w * 0.115));
 // Keep ~1cm ground visible above the canvas bottom (shell already clears
 // safe-area / home indicator via padding-bottom + --app-height).
 const groundH = Math.max(
   GROUND_MIN,
   Math.min(GROUND_MAX, Math.round(h * 0.09)),
 );
 const baseY = Math.max(groundH + 80, h - groundH);
 // Tree height = 75–90% of canvas (TREE_HEIGHT_FRAC), capped by baseY
 const treeH = Math.min(
   baseY,
   Math.max(
     h * TREE_HEIGHT_MIN_FRAC,
     Math.min(h * TREE_HEIGHT_MAX_FRAC, h * TREE_HEIGHT_FRAC),
   ),
 );
 // Hero = 8–12% of tree height
 const heroH = Math.max(
   h * TREE_HEIGHT_MIN_FRAC * HERO_OF_TREE_MIN,
   Math.min(
     treeH * HERO_OF_TREE_MAX,
     treeH * HERO_OF_TREE_FRAC,
   ),
 );
 // Tall blocks: each longer than the hero; count fills treeH
 const minSegH = heroH * 1.55;
 const nextSegs = Math.max(4, Math.floor(treeH / minSegH));
 const segH = treeH / nextSegs;
 if (nextSegs !== SEGMENTS) {
   SEGMENTS = nextSegs;
   while (trunk.length < SEGMENTS) {
     trunk.push(TreeBranchController.next(score));
   }
   if (trunk.length > SEGMENTS) trunk.length = SEGMENTS;
 }
 return {
   w,
   h,
   cx,
   trunkW,
   segH,
   baseY,
   groundH,
   treeH,
   heroH,
   segments: SEGMENTS,
 };
}
 
/**
* Current drop offset (≤0). Always samples the active time-based anim so
* the stack cannot get stuck floating above the stump.
* @param {number} [now]
*/
function sampleTrunkDropY(now = performance.now()) {
 if (!trunkDropAnim) {
   trunkDropY = 0;
   return 0;
 }
 // QA shot harness: hold the mid-drop pose (do not ease while frozen)
 if (shotFreeze) {
   trunkDropY = trunkDropAnim.from;
   return trunkDropY;
 }
 const t = (now - trunkDropAnim.start) / trunkDropAnim.duration;
 if (t >= 1 || !Number.isFinite(t)) {
   trunkDropAnim = null;
   trunkDropY = 0;
   return 0;
 }
 // Ease-out cubic — fast start, soft settle flush on stump (KK2 feel)
 const e = 1 - (1 - t) ** 3;
 trunkDropY = trunkDropAnim.from * (1 - e);
 // Snap when essentially flush so no sub-pixel hover remains
 if (trunkDropY > -0.5) {
   trunkDropAnim = null;
   trunkDropY = 0;
   return 0;
 }
 return trunkDropY;
}
 
/**
* Queue one segment of fall after a successful chop (stacks if mid-drop).
* Recaptures the *current* visual offset so rapid taps stay smooth.
* @param {number} segH
*/
function beginTrunkDrop(segH) {
 if (!(segH > 0) || !Number.isFinite(segH)) return;
 const now = performance.now();
 const current = sampleTrunkDropY(now);
 const from = current - segH;
 const segs = Math.max(1, Math.abs(from) / segH);
 const duration = Math.min(
   DROP_DURATION_MAX_MS,
   Math.max(
     DROP_DURATION_MIN_MS,
     DROP_DURATION_MS * Math.min(segs, 2.2),
   ),
 );
 trunkDropAnim = { start: now, from, duration };
 trunkDropY = from;
}
 
/** Advance / settle drop (also safe to call from draw). */
function updateTrunkDrop(_dt) {
 sampleTrunkDropY(performance.now());
}function draw(now) {
 const { w, h, cx, trunkW, segH, baseY, treeH } = layout();
 ctx.clearRect(0, 0, w, h);
 
 if (petals.length === 0) seedPetals(w, h);
 
 drawAtmosphere(w, h, baseY);
 
 // Stump stays fixed — stack slides tekis (vertical only) flush onto it
 roundRect(
   cx - trunkW * 0.65,
   baseY - 4,
   trunkW * 1.3,
   14,
   4,
   "#8a6238",
 );
 
 // Sample drop every paint so settle can't stall between loop ticks
 const dropY = sampleTrunkDropY(
   typeof now === "number" ? now : performance.now(),
 );
 const trunkX = cx - trunkW / 2;
 ctx.save();
 // No bend / lean / shake — perfectly vertical drop (KK2 slot feel)
 // Fill only the segment stack bounds (never leave a phantom hover slab)
 const stackTop = baseY - treeH + dropY;
 const stackBottom = baseY + dropY;
 const fillH = Math.max(0, stackBottom - stackTop + 1);
 if (fillH > 0) {
   ctx.fillStyle = "#c49a6c";
   ctx.fillRect(trunkX, stackTop, trunkW, fillH);
   ctx.fillStyle = "rgba(90, 50, 22, 0.22)";
   ctx.fillRect(trunkX, stackTop, 7, fillH);
   ctx.fillRect(trunkX + trunkW - 8, stackTop, 8, fillH);
   ctx.fillStyle = "rgba(255, 230, 190, 0.2)";
   ctx.fillRect(trunkX + 8, stackTop, 5, fillH);
 }
 
 for (let i = SEGMENTS - 1; i >= 0; i--) {
   const y = baseY - (i + 1) * segH + dropY;
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
 ctx.restore();
 
 // Player — feet on stump ledge; close enough for kick to read as trunk hit
 const playerY = baseY + 2;
 const sideGap = Math.max(32, trunkW * 0.52 + 10);
 const px =
   playerSide === "left" ? cx - trunkW / 2 - sideGap : cx + trunkW / 2 + sideGap;
 drawPlayer(px, playerY, playerSide, now);
 
 // Soft reflection of player
 ctx.save();
 ctx.globalAlpha = 0.14;
 ctx.translate(0, baseY + 6);
 ctx.scale(1, -0.3);
 drawPlayer(px, -(playerY - baseY) + 4, playerSide, now, 0.92);
 ctx.restore();
 ctx.globalAlpha = 1;
 
 // Debris — compact flying wood chunks (ixcham)
 for (const d of debris) {
   const dw = d.w || trunkW * 0.48;
   const dh = d.h || Math.min(26, segH * 0.16);
   ctx.save();
   ctx.translate(d.x, d.y);
   ctx.rotate(d.rot);
   ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
   roundRect(-dw / 2, -dh / 2, dw, dh, 2.5, "#c49a6c");
   ctx.strokeStyle = "rgba(90, 50, 25, 0.28)";
   ctx.lineWidth = 1;
   ctx.beginPath();
   ctx.moveTo(-dw / 2 + 4, 0);
   ctx.lineTo(dw / 2 - 4, 0.5);
   ctx.stroke();
   if (d.branch) {
     // Short stub plank (not a full-size branch)
     const bh = Math.min(8, dh * 0.4);
     const bw = dw * 1.55;
     const left = d.branch === "left";
     const hx = left ? -dw / 2 - bw + 3 : dw / 2 - 3;
     roundRect(hx, -dh / 2, bw, bh, 2, "#a67c52");
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
 
 // Floating +N near kick (HUD Ball/Rekord stays — no mid-trunk score)
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
 
 if (phase === "paused") {
   ctx.fillStyle = "rgba(10, 4, 20, 0.45)";
   ctx.fillRect(0, 0, w, h);
   ctx.fillStyle = "#fff";
   ctx.font = "800 28px Manrope, sans-serif";
   ctx.textAlign = "center";
   ctx.fillText("Pauza", cx, h * 0.45);
 }
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
 trunk.push(TreeBranchController.next(score + 1));
 // Upper stack stays visually raised, then slides tekis into the gap (queueable)
 beginTrunkDrop(segH);
 
 score += 1;
 hudScore.textContent = String(score);
 const { refill } = difficultyFor(score);
 energy = Math.min(ENERGY_MAX, energy + refill);
 multiFill = Math.min(1, multiFill + MULTI_GAIN);
 multi = Math.min(MULTI_MAX, 1 + multiFill * (MULTI_MAX - 1));
 setEnergyUi();
 setMultiUi();
 playChopTone();
}
 
/* ── Arcade SFX (Web Audio: noise + short tones, no big asset packs) ── */
/** @type {AudioContext | undefined} */
let audioCtx;
/** Shared noise sample for hit / thud bursts. */
/** @type {AudioBuffer | undefined} */
let noiseBuffer;
 
function getAudioCtx() {
 const AC = window.AudioContext || window.webkitAudioContext;
 if (!AC) return null;
 if (!audioCtx) audioCtx = new AC();
 return audioCtx;
}
 
/** Resume AudioContext after a user gesture (required on mobile / Telegram). */
function unlockAudio() {
 const ac = getAudioCtx();
 if (!ac) return;
 if (ac.state === "suspended") void ac.resume();
}
 
/**
* @param {AudioContext} ac
*/
function getNoiseBuffer(ac) {
 if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
 const len = Math.max(1, Math.floor(ac.sampleRate * 0.25));
 const buf = ac.createBuffer(1, len, ac.sampleRate);
 const data = buf.getChannelData(0);
 for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
 noiseBuffer = buf;
 return buf;
}
 
/**
* @param {AudioContext} ac
* @param {number} peak
* @param {number} attack
* @param {number} decay
*/
function envGain(ac, peak, attack, decay) {
 const g = ac.createGain();
 const t = ac.currentTime;
 g.gain.setValueAtTime(0.0001, t);
 g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
 g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
 return g;
}
 
/**
* Band-passed noise burst (wood/impact body).
* @param {AudioContext} ac
* @param {number} duration
* @param {number} peak
* @param {number} filterFreq
* @param {number} q
*/
function playNoiseBurst(ac, duration, peak, filterFreq, q) {
 const src = ac.createBufferSource();
 src.buffer = getNoiseBuffer(ac);
 const filter = ac.createBiquadFilter();
 filter.type = "bandpass";
 filter.frequency.value = filterFreq;
 filter.Q.value = q;
 const g = envGain(ac, peak, 0.002, duration);
 src.connect(filter);
 filter.connect(g);
 g.connect(ac.destination);
 src.start();
 src.stop(ac.currentTime + duration + 0.05);
}
 
/**
* Short pitched tone with optional downward slide.
* @param {AudioContext} ac
* @param {OscillatorType} type
* @param {number} freq
* @param {number} peak
* @param {number} dur
* @param {number} [slideTo]
*/
function playTone(ac, type, freq, peak, dur, slideTo) {
 const o = ac.createOscillator();
 const g = envGain(ac, peak, 0.002, dur);
 o.type = type;
 const t = ac.currentTime;
 o.frequency.setValueAtTime(freq, t);
 if (slideTo != null && slideTo > 0) {
   o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
 }
 o.connect(g);
 g.connect(ac.destination);
 o.start();
 o.stop(t + dur + 0.05);
}
 
/** Successful chop — punchier every 4th (punch pose), woodier kick otherwise. */
function playChopTone() {
 if (muted) return;
 try {
   const ac = getAudioCtx();
   if (!ac) return;
   if (ac.state === "suspended") void ac.resume();
   const punch = strikeKind === "punch";
   if (punch) {
     // Brighter fist snap + crack
     playNoiseBurst(ac, 0.055, 0.2, 2100, 0.9);
     playNoiseBurst(ac, 0.03, 0.1, 4200, 1.2);
     playTone(ac, "square", 240 + Math.random() * 40, 0.07, 0.045, 95);
     playTone(ac, "triangle", 520, 0.035, 0.035, 180);
   } else {
     // Wood kick thud + mid crack
     playNoiseBurst(ac, 0.075, 0.17, 780, 0.55);
     playNoiseBurst(ac, 0.04, 0.08, 1600, 0.8);
     playTone(ac, "sine", 78 + Math.random() * 12, 0.1, 0.09, 42);
     playTone(ac, "triangle", 170 + Math.random() * 35, 0.08, 0.065, 70);
   }
 } catch {
   /* ignore */
 }
}
 
/** Soft UI click (start / unmute). */
function playUiTap() {
 if (muted) return;
 try {
   const ac = getAudioCtx();
   if (!ac) return;
   if (ac.state === "suspended") void ac.resume();
   playTone(ac, "sine", 660, 0.03, 0.04, 420);
 } catch {
   /* ignore */
 }
}
 
/**
* Game-over / energy-out cue.
* @param {string} [reason]
*/
function playGameOverSfx(reason) {
 if (muted) return;
 try {
   const ac = getAudioCtx();
   if (!ac) return;
   if (ac.state === "suspended") void ac.resume();
   const energyOut = typeof reason === "string" && /vaqt|tugadi/i.test(reason);
   if (energyOut) {
     // Soft depleting whistle
     playTone(ac, "sine", 320, 0.06, 0.22, 90);
     playTone(ac, "triangle", 180, 0.04, 0.28, 60);
   } else {
     // Branch hit — heavy dull impact
     playNoiseBurst(ac, 0.14, 0.22, 420, 0.45);
     playTone(ac, "sine", 110, 0.12, 0.18, 40);
     playTone(ac, "triangle", 70, 0.08, 0.22, 35);
   }
 } catch {
   /* ignore */
 }
}
 
function endGame(reason) {
 if (phase === "over" || phase === "dying") return;
 phase = "dying";
 chopping = false;
 walkUntil = 0;
 deathStartedAt = performance.now();
 heroPose = "hurt";
 pendingOverReason = reason || "Yana urinib ko‘ring!";
 playGameOverSfx(pendingOverReason);
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
 unlockAudio();
 resetRun();
 phase = "playing";
 hideOverlay();
 lastTs = performance.now();
 playUiTap();
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
   unlockAudio();
   onPointer(ev.clientX);
 },
 { passive: false },
);
 
window.addEventListener("keydown", (ev) => {
 unlockAudio();
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
   if (!muted) {
     unlockAudio();
     playUiTap();
   }
 }
});
 
primaryBtn.addEventListener("click", () => {
 unlockAudio();
 startGame();
});
 
btnMute?.addEventListener("click", (ev) => {
 ev.stopPropagation();
 muted = !muted;
 btnMute.classList.toggle("muted", muted);
 if (!muted) {
   unlockAudio();
   playUiTap();
 }
});
 
btnPause?.addEventListener("click", (ev) => {
 ev.stopPropagation();
 if (phase === "ready") startGame();
 else togglePause();
});
 
function loop(ts) {
 if (!lastTs) lastTs = ts;
 // Target ~60 FPS; clamp large hitches so physics stay stable
 const dt = Math.min(DT_MAX, (ts - lastTs) / 1000);
 lastTs = ts;
 animT += dt;
 
 if (phase === "playing" && !shotFreeze) {
   if (graceLeft > 0) {
     graceLeft -= dt;
   } else {
     const { drainScale } = difficultyFor(score);
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
 
 // Drop must always settle flush — even during pause freeze the pose,
 // but never leave a stuck hover after a chop while playing.
 if (!shotFreeze) {
   updateTrunkDrop(dt);
 }
 if (phase !== "paused" && !shotFreeze) {
   const { baseY: groundY } = layout();
   for (const d of debris) {
     if (!d.grounded) {
       d.x += d.vx * dt;
       d.y += d.vy * dt;
       d.vy += DEBRIS_GRAVITY * dt;
       d.vx *= Math.exp(-0.4 * dt);
       d.rot += d.vr * dt;
       // Simple ground collision / stop
       const floor = groundY - d.h * 0.35;
       if (d.y >= floor) {
         d.y = floor;
         d.vy = 0;
         d.vx *= 0.35;
         d.vr *= 0.2;
         d.grounded = true;
       }
     } else {
       d.vx *= Math.exp(-3 * dt);
       d.vr *= Math.exp(-4 * dt);
       d.life -= dt * 1.4;
     }
     d.life -= dt * 0.55;
   }
   debris = debris.filter((d) => d.life > 0);
 
   for (const c of chips) {
     c.x += c.vx * dt;
     c.y += c.vy * dt;
     c.vy += DEBRIS_GRAVITY * 0.85 * dt;
     c.a -= dt * 1.6;
     if (c.y > groundY + 8) c.a = 0;
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
 TreeBranchController.reset();
 seedTrunk();
});
layout();
TreeBranchController.reset();
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
 
// Screenshot / QA harness: /karate/?shot=idle|kick|defeat|tree|split|drop
if (urlParams.has("shot")) {
 window.__karateShot = {
   ready: () => heroReady,
   layout: () => layout(),
   trunk: () => trunk.slice(),
   debrisCount: () => debris.length,
   floatsCount: () => floats.length,
   difficulty: (s) => difficultyFor(s),
   dropY: () => trunkDropY,
   feel: () => ({
     TARGET_FPS,
     DT_MAX,
     SPRITE_FPS,
     CHOP_MS,
     WALK_MS,
     TREE_HEIGHT_FRAC,
     HERO_OF_TREE_FRAC,
     DROP_DURATION_MS,
     DEBRIS_SPIN_DEG_MIN,
     DEBRIS_SPIN_DEG_MAX,
     DEBRIS_GRAVITY,
   }),
   branchController: () => ({
     seed: TreeBranchController.seed,
     tier: TreeBranchController.tier,
     lastComboKey: TreeBranchController.lastComboKey,
   }),
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
     trunkDropAnim = null;
     trunkDropY = 0;
     if (pose === "kick" || pose === "split" || pose === "drop") {
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
     if (pose === "tree" || pose === "split" || pose === "drop") {
       resize();
       const L0 = layout(); // sync SEGMENTS to tall-block count
       const n = L0.segments;
       if (pose === "tree") {
         // Demo: gaps + clusters (not every segment branched)
         TreeBranchController.reset(0xc0ffee);
         trunk = TreeBranchController.seedQueue(n, 25); // MEDIUM density sample
       } else {
         // Kick/drop shots: sparse-ish for readability
         trunk = [];
         for (let i = 0; i < n; i++) {
           // empty, right, empty, left-left cluster pattern-ish
           if (i === 1) trunk.push("right");
           else if (i === 3 || i === 4) trunk.push("left");
           else if (i === n - 2) trunk.push("right");
           else trunk.push(null);
         }
       }
     }
     if (pose === "split" || pose === "drop") {
       resize();
       const L = layout();
       spawnDebris(L.cx, L.baseY, L.trunkW, L.segH, "left", "right");
       debris.forEach((d, i) => {
         d.x = L.cx + L.trunkW * (1.2 + i * 0.55);
         d.y = L.baseY - L.segH * (0.28 + i * 0.12);
         d.vx = 0;
         d.vy = 0;
         d.rot = 0.45 + i * 0.25;
         d.vr = 0;
         d.life = 1;
       });
       chips = chips.slice(0, 4).map((c, i) => ({
         ...c,
         x: L.cx + 18 + i * 8,
         y: L.baseY - L.segH * 0.3 - i * 5,
         vx: 0,
         vy: 0,
         a: 1,
       }));
       spawnFloat(L.cx + 10, L.baseY - L.segH * 0.7, "+1");
       if (floats[0]) {
         floats[0].vy = 0;
         floats[0].life = 1;
       }
       if (pose === "drop") {
         // Freeze mid-fall for QA — tekis vertical only (no bend)
         trunkDropAnim = {
           start: performance.now(),
           from: -L.segH * 0.55,
           duration: 60_000,
         };
         trunkDropY = -L.segH * 0.55;
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
