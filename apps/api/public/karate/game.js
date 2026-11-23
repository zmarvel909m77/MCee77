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

const TARGET_FPS = 60;
const DT_MAX = 2 / TARGET_FPS;
const SPRITE_FPS = 45;
const WALK_MS = Math.round((4 / SPRITE_FPS) * 1000);
const CHOP_MS = 120;
const TREE_HEIGHT_FRAC = 0.82;
const TREE_HEIGHT_MIN_FRAC = 0.82;
const TREE_HEIGHT_MAX_FRAC = 0.82;
const HERO_OF_TREE_FRAC = 0.1;
const HERO_OF_TREE_MIN = 0.08;
const HERO_OF_TREE_MAX = 0.12;
const DROP_DURATION_MS = 280;
const DROP_DURATION_MIN_MS = 250;
const DROP_DURATION_MAX_MS = 600;
const DEBRIS_SPIN_DEG_MIN = 90;
const DEBRIS_SPIN_DEG_MAX = 180;
const DEBRIS_GRAVITY = 980;
const GROUND_MIN = 40;
const GROUND_MAX = 48;

let SEGMENTS = 5;
const ENERGY_MAX = 100;
const ENERGY_DRAIN = 11;
const ENERGY_REFILL = 18;
const DIFF_EASY_UNTIL = 20;
const HURT_MS = 380;
const DEFEAT_HOLD_MS = 520;
const MULTI_DECAY = 0.55;
const MULTI_GAIN = 0.14;
const MULTI_MAX = 2.5;

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

let phase = "ready";
let score = 0;
let best = 0;
let energy = ENERGY_MAX;
let multi = 1;
let multiFill = 0;
let playerSide = "right";
let trunk = [];
let chopping = false;
let chopUntil = 0;
let heroPose = "idle";
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
let graceLeft = 0;
let strikeCount = 0;
let trunkDropAnim = null;
let trunkDropY = 0;
let debris = [];
let floats = [];
let chips = [];
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

function createRng(seed) {
 let s = seed >>> 0;
 return function rand() {
   s = (s + 0x6d2b79f5) | 0;
   let t = Math.imul(s ^ (s >>> 15), 1 | s);
   t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
   return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

const TreeBranchController = {
 seed: 0,
 rand: Math.random,
 tier: "EASY",
 gapLeft: 0,
 comboLeft: 0,
 comboSide: null,
 lastComboKey: "",
 pendingSide: null,
 pendingLen: 0,
 pendingComboKey: "",

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

 tierFor(score) {
   if (score < 15) return "EASY";
   if (score < 40) return "MEDIUM";
   if (score < 80) return "HARD";
   return "EXTREME";
 },

 params(tier) {
   switch (tier) {
     case "EASY":
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
       return {
         gapMin: 0,
         gapMax: 1,
         comboWeights: [0.18, 0.37, 0.45],
         switchBias: 0.78,
       };
   }
 },

 _pickComboLen(weights) {
   const r = this.rand();
   let acc = 0;
   for (let i = 0; i < weights.length; i++) {
     acc += weights[i];
     if (r < acc) return i + 1;
   }
   return 1;
 },

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

   let tries = 0;
   let side = "left";
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

 next(score) {
   this.tier = this.tierFor(score);

   if (this.gapLeft > 0) {
     this.gapLeft -= 1;
     return null;
   }

   if (this.comboLeft <= 0) {
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

 seedQueue(count, score = 0) {
   this.gapLeft = Math.max(this.gapLeft, 1 + Math.floor(this.rand() * 2));
   this.pendingSide = "left";
   this.pendingLen = 1;
   this.pendingComboKey = "left:1";

   const out = [];
   for (let i = 0; i < count; i++) {
     out.push(this.next(score));
   }
   if (out[0] === "right") out[0] = null;
   return out;
 }
};

function difficultyFor(runScore) {
 const tier = TreeBranchController.tierFor(runScore);
 const easy = tier === "EASY";
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
 TreeBranchController.reset();
 seedTrunk();
 hudScore.textContent = "0";
 setEnergyUi();
 setMultiUi();
 submitStatus.textContent = "";
 submitStatus.classList.remove("error", "ok");
}
