/**
 * Air Hockey — offline (AI / local 2P) + online matchmaking Mini App.
 */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayScore = document.getElementById("overlayScore");
const submitStatus = document.getElementById("submitStatus");
const modeButtons = document.getElementById("modeButtons");
const actionButtons = document.getElementById("actionButtons");
const primaryBtn = document.getElementById("primaryBtn");
const menuBtn = document.getElementById("menuBtn");
const hudScore = document.getElementById("hudScore");

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Bot API 7.7+: block pull-down sheet close; exit via Telegram header X only
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
  try {
    tg.setHeaderColor("#04151c");
    tg.setBackgroundColor("#04151c");
  } catch {
    /* older clients */
  }
}

const W = 360;
const H = 640;
const PUCK_R = 14;
const PADDLE_R = 28;
const GOAL_WIDTH = 120;
const FRICTION = 0.992;
const MAX_PUCK_SPEED = 14;
const WALL_BOUNCE = 0.92;
const PADDLE_RESTITUTION = 1.05;
const WIN_SCORE = 5;
const bootParams = new URLSearchParams(location.search);
const bootMode = bootParams.get("mode");
const bootInvite = bootParams.get("invite");

/** @typedef {"menu"|"playing"|"over"|"queue"} Phase */
/** @typedef {"ai"|"local"|"online"} Mode */

/** @type {Phase} */
let phase = "menu";
/** @type {Mode | null} */
let mode = null;
/** @type {0|1|null} */
let mySeat = 0;

const state = {
  puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
  paddles: [
    { x: W / 2, y: H * 0.78, vx: 0, vy: 0 },
    { x: W / 2, y: H * 0.22, vx: 0, vy: 0 },
  ],
  score: /** @type {[number, number]} */ ([0, 0]),
};

/** pointer id → seat */
const pointers = new Map();

/** Online */
let ws = null;
let roomToken = null;
let pingTimer = null;
let remoteNames = { you: "Siz", opponent: "Raqib" };
let lastSnapshotAt = 0;

function showMenu() {
  phase = "menu";
  mode = null;
  closeWs();
  overlay.classList.remove("hidden");
  modeButtons.classList.remove("hidden");
  actionButtons.classList.add("hidden");
  overlayTitle.textContent = "Air Hockey";
  overlayText.textContent =
    "Battle disc — diskni raqib darvozasiga uring. Offline yoki online tanlang.";
  overlayScore.classList.add("hidden");
  submitStatus.textContent = "";
  submitStatus.classList.remove("error");
  hudScore.textContent = "0 — 0";
}

function showPlayingHud() {
  overlay.classList.add("hidden");
  phase = "playing";
}

function showOver(title, text, scoreLine) {
  phase = "over";
  overlay.classList.remove("hidden");
  modeButtons.classList.add("hidden");
  actionButtons.classList.remove("hidden");
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  if (scoreLine) {
    overlayScore.textContent = scoreLine;
    overlayScore.classList.remove("hidden");
  } else {
    overlayScore.classList.add("hidden");
  }
  primaryBtn.textContent = "Qayta o‘ynash";
}

function resetLocalState() {
  state.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  state.paddles = [
    { x: W / 2, y: H * 0.78, vx: 0, vy: 0 },
    { x: W / 2, y: H * 0.22, vx: 0, vy: 0 },
  ];
  state.score = [0, 0];
  hudScore.textContent = "0 — 0";
  pointers.clear();
  resetPuck(Math.random() < 0.5 ? 0 : 1);
}

function clampPaddle(paddle, side, targetX, targetY) {
  const minY = side === 0 ? H * 0.52 : PADDLE_R + 8;
  const maxY = side === 0 ? H - PADDLE_R - 8 : H * 0.48;
  const nx = Math.min(W - PADDLE_R - 4, Math.max(PADDLE_R + 4, targetX));
  const ny = Math.min(maxY, Math.max(minY, targetY));
  paddle.vx = nx - paddle.x;
  paddle.vy = ny - paddle.y;
  paddle.x = nx;
  paddle.y = ny;
}

function collidePaddle(puck, paddle) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const minDist = PUCK_R + PADDLE_R;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  puck.x = paddle.x + nx * minDist;
  puck.y = paddle.y + ny * minDist;

  const relVx = puck.vx - paddle.vx;
  const relVy = puck.vy - paddle.vy;
  const closing = relVx * nx + relVy * ny;
  if (closing >= 0) return;

  puck.vx = (puck.vx - closing * nx) * PADDLE_RESTITUTION + paddle.vx * 0.85;
  puck.vy = (puck.vy - closing * ny) * PADDLE_RESTITUTION + paddle.vy * 0.85;

  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > MAX_PUCK_SPEED) {
    const s = MAX_PUCK_SPEED / speed;
    puck.vx *= s;
    puck.vy *= s;
  }
}

function stepSim() {
  const puck = state.puck;
  puck.x += puck.vx;
  puck.y += puck.vy;
  puck.vx *= FRICTION;
  puck.vy *= FRICTION;

  const goalLeft = (W - GOAL_WIDTH) / 2;
  const goalRight = goalLeft + GOAL_WIDTH;

  if (puck.x - PUCK_R < 0) {
    puck.x = PUCK_R;
    puck.vx = Math.abs(puck.vx) * WALL_BOUNCE;
  } else if (puck.x + PUCK_R > W) {
    puck.x = W - PUCK_R;
    puck.vx = -Math.abs(puck.vx) * WALL_BOUNCE;
  }

  if (puck.y - PUCK_R < 0) {
    if (puck.x > goalLeft && puck.x < goalRight) return 0;
    puck.y = PUCK_R;
    puck.vy = Math.abs(puck.vy) * WALL_BOUNCE;
  } else if (puck.y + PUCK_R > H) {
    if (puck.x > goalLeft && puck.x < goalRight) return 1;
    puck.y = H - PUCK_R;
    puck.vy = -Math.abs(puck.vy) * WALL_BOUNCE;
  }

  collidePaddle(puck, state.paddles[0]);
  collidePaddle(puck, state.paddles[1]);
  return null;
}

function resetPuck(toward) {
  state.puck.x = W / 2;
  state.puck.y = H / 2;
  state.puck.vx = (Math.random() - 0.5) * 2.2;
  state.puck.vy = toward === 0 ? 3.2 : -3.2;
}

function aiTarget() {
  const puck = state.puck;
  const paddle = state.paddles[1];
  const difficulty = 0.72;
  const chaseX = paddle.x + (puck.x - paddle.x) * difficulty;
  let chaseY = H * 0.22;
  if (puck.y < H * 0.5) {
    chaseY = paddle.y + (puck.y - 36 - paddle.y) * (difficulty * 0.85);
  }
  return { x: chaseX, y: chaseY };
}

function canvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * W,
    y: ((clientY - rect.top) / rect.height) * H,
  };
}

function seatForLocalPointer(y) {
  if (mode === "local") return y > H / 2 ? 0 : 1;
  return /** @type {0|1} */ (mySeat ?? 0);
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "playing") return;
  if (mode === "online" && mySeat === null) return;
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e.clientX, e.clientY);
  const seat = mode === "online" ? mySeat : seatForLocalPointer(p.y);
  if (seat === null) return;
  if (mode === "ai" && seat !== 0) return;
  pointers.set(e.pointerId, seat);
  clampPaddle(state.paddles[seat], seat, p.x, p.y);
  if (mode === "online") sendInput();
});

canvas.addEventListener("pointermove", (e) => {
  if (phase !== "playing") return;
  const seat = pointers.get(e.pointerId);
  if (seat === undefined) return;
  const p = canvasPoint(e.clientX, e.clientY);
  clampPaddle(state.paddles[seat], seat, p.x, p.y);
  if (mode === "online") sendInput();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

modeButtons.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  const next = btn.getAttribute("data-mode");
  if (next === "ai" || next === "local") startOffline(next);
  else if (next === "online") startOnline();
});

primaryBtn.addEventListener("click", () => {
  if (phase === "queue") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel_queue" }));
    }
    showMenu();
    return;
  }
  if (phase === "over") {
    if (mode === "online") startOnline();
    else if (mode === "ai" || mode === "local") startOffline(mode);
    else showMenu();
    return;
  }
  showMenu();
});

menuBtn.addEventListener("click", () => showMenu());

function startOffline(selected) {
  mode = selected;
  mySeat = 0;
  resetLocalState();
  showPlayingHud();
  submitStatus.textContent = "";
  primaryBtn.textContent = "Qayta o‘ynash";
}

function startOnline(inviteKey) {
  mode = "online";
  mySeat = null;
  roomToken = sessionStorage.getItem("ah_room_token");
  overlay.classList.remove("hidden");
  modeButtons.classList.add("hidden");
  actionButtons.classList.remove("hidden");
  phase = "queue";
  overlayTitle.textContent = inviteKey ? "Taklif" : "Online";
  overlayText.textContent = inviteKey
    ? "Raqib kutilyapti…"
    : "Raqib qidirilmoqda…";
  overlayScore.classList.add("hidden");
  primaryBtn.textContent = "Bekor qilish";
  submitStatus.textContent = "";
  connectWs(true, inviteKey || null);
}

function closeWs() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (ws) {
    try {
      ws.onclose = null;
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/air-hockey`;
}

function authPayload() {
  const initData = tg?.initData || "";
  if (initData) return { initData };
  // Dev browser path
  const id = Number(sessionStorage.getItem("ah_dev_id") || 0) || Date.now() % 1_000_000;
  sessionStorage.setItem("ah_dev_id", String(id));
  return { devTelegramId: id, displayName: `Dev ${id}` };
}

function connectWs(enqueue, inviteKey) {
  closeWs();
  ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    const hello = {
      type: "hello",
      ...authPayload(),
      roomToken: roomToken || undefined,
    };
    ws.send(JSON.stringify(hello));
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleServer(msg, enqueue, inviteKey);
  };

  ws.onclose = () => {
    if (phase === "queue") {
      submitStatus.textContent = "Aloqa uzildi";
      submitStatus.classList.add("error");
    }
  };
}

function handleServer(msg, enqueueAfterWelcome, inviteKey) {
  switch (msg.type) {
    case "welcome":
      if (enqueueAfterWelcome && !roomToken) {
        if (inviteKey) {
          ws.send(JSON.stringify({ type: "join_invite", inviteKey }));
        } else {
          ws.send(JSON.stringify({ type: "queue" }));
        }
      }
      break;
    case "queued":
      overlayText.textContent = `Navbatda… (taxminan ${Math.round((msg.timeoutMs || 30000) / 1000)}s)`;
      break;
    case "queue_timeout":
      mode = null;
      showOver("Raqib yo‘q", msg.message || "Offline rejimni sinab ko‘ring.", "");
      primaryBtn.textContent = "Menyu";
      break;
    case "match_found":
      mySeat = msg.seat;
      roomToken = msg.roomToken;
      sessionStorage.setItem("ah_room_token", roomToken);
      remoteNames = {
        you: msg.you?.displayName || "Siz",
        opponent: msg.opponent?.displayName || "Raqib",
      };
      state.score = [0, 0];
      hudScore.textContent = "0 — 0";
      showPlayingHud();
      startPing();
      break;
    case "snapshot":
      applySnapshot(msg);
      break;
    case "goal":
      state.score = msg.score;
      hudScore.textContent = `${msg.score[0]} — ${msg.score[1]}`;
      break;
    case "match_over":
      sessionStorage.removeItem("ah_room_token");
      roomToken = null;
      state.score = msg.score;
      hudScore.textContent = `${msg.score[0]} — ${msg.score[1]}`;
      {
        const won = msg.winnerSeat === mySeat;
        const title =
          msg.status === "aborted"
            ? "Match bekor"
            : won
              ? "G‘alaba!"
              : "Mag‘lubiyat";
        const text =
          msg.status === "aborted"
            ? msg.reason === "opponent_timeout"
              ? "Raqib uzildi — forfeit."
              : "Match to‘xtatildi."
            : `+${msg.pointsAwarded} ball reytingga qo‘shildi.`;
        showOver(title, text, `Hisob: ${msg.score[0]} — ${msg.score[1]}`);
        primaryBtn.textContent = "Yana online";
      }
      break;
    case "opponent_disconnected":
      submitStatus.textContent = "Raqib uzildi — kutilyapti…";
      break;
    case "opponent_reconnected":
      submitStatus.textContent = "Raqib qaytdi";
      setTimeout(() => {
        if (submitStatus.textContent === "Raqib qaytdi") submitStatus.textContent = "";
      }, 1500);
      break;
    case "pong":
      break;
    case "error":
      submitStatus.textContent = msg.message || "Xato";
      submitStatus.classList.add("error");
      break;
    default:
      break;
  }
}

function applySnapshot(msg) {
  lastSnapshotAt = performance.now();
  state.puck = msg.puck;
  state.paddles = msg.paddles;
  state.score = msg.score;
  hudScore.textContent = `${msg.score[0]} — ${msg.score[1]}`;
}

function sendInput() {
  if (!ws || ws.readyState !== WebSocket.OPEN || mySeat === null) return;
  const p = state.paddles[mySeat];
  ws.send(JSON.stringify({ type: "input", x: p.x, y: p.y }));
}

function startPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }
  }, 5000);
}

function endOffline(winnerSeat) {
  const won = winnerSeat === 0;
  const title = mode === "local"
    ? winnerSeat === 0
      ? "Pastki o‘yinchi g‘olib"
      : "Yuqori o‘yinchi g‘olib"
    : won
      ? "G‘alaba!"
      : "Mag‘lubiyat";
  showOver(
    title,
    "Offline o‘yin — ball bermaydi (faqat online ball beradi).",
    `Hisob: ${state.score[0]} — ${state.score[1]}`,
  );
  submitStatus.textContent = "0 ball (offline)";
}

let lastTs = performance.now();
function frame(ts) {
  const dt = Math.min(32, ts - lastTs);
  lastTs = ts;

  if (phase === "playing" && (mode === "ai" || mode === "local")) {
    // Fixed-ish step: run ~1 physics step per ~16ms
    const steps = Math.max(1, Math.round(dt / 16));
    for (let i = 0; i < steps; i++) {
      if (mode === "ai") {
        const t = aiTarget();
        clampPaddle(state.paddles[1], 1, t.x, t.y);
      }
      const scored = stepSim();
      if (scored !== null) {
        state.score[scored] += 1;
        hudScore.textContent = `${state.score[0]} — ${state.score[1]}`;
        if (state.score[scored] >= WIN_SCORE) {
          endOffline(scored);
          break;
        }
        resetPuck(scored === 0 ? 1 : 0);
      }
    }
  }

  draw(ts);
  requestAnimationFrame(frame);
}

function draw(ts) {
  // Ice rink
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0e5262");
  g.addColorStop(0.45, "#0a3c49");
  g.addColorStop(1, "#072e38");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Soft vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, "rgba(255,255,255,0)");
  vig.addColorStop(1, "rgba(0,10,16,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Subtle moving sheen
  const sheen = ((ts / 40) % (H + 80)) - 40;
  ctx.fillStyle = "rgba(180, 240, 255, 0.045)";
  ctx.fillRect(0, sheen, W, 56);

  // Boards
  ctx.strokeStyle = "rgba(126, 240, 212, 0.5)";
  ctx.lineWidth = 7;
  roundRect(8, 8, W - 16, H - 16, 20);
  ctx.stroke();

  // Center line + circle
  ctx.strokeStyle = "rgba(120, 210, 230, 0.38)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(20, H / 2);
  ctx.lineTo(W - 20, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(126, 240, 212, 0.35)";
  ctx.fill();

  // Goals with glow
  const goalLeft = (W - GOAL_WIDTH) / 2;
  ctx.fillStyle = "rgba(255, 107, 74, 0.22)";
  ctx.fillRect(goalLeft - 6, 0, GOAL_WIDTH + 12, 18);
  ctx.fillStyle = "rgba(255, 107, 74, 0.55)";
  ctx.fillRect(goalLeft, 0, GOAL_WIDTH, 10);
  ctx.fillStyle = "rgba(126, 240, 212, 0.22)";
  ctx.fillRect(goalLeft - 6, H - 18, GOAL_WIDTH + 12, 18);
  ctx.fillStyle = "rgba(126, 240, 212, 0.55)";
  ctx.fillRect(goalLeft, H - 10, GOAL_WIDTH, 10);

  // Seat labels (online)
  if (mode === "online" && phase === "playing") {
    ctx.fillStyle = "rgba(238, 248, 251, 0.55)";
    ctx.font = "600 12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    const topName = mySeat === 1 ? remoteNames.you : remoteNames.opponent;
    const botName = mySeat === 0 ? remoteNames.you : remoteNames.opponent;
    ctx.fillText(topName, W / 2, 28);
    ctx.fillText(botName, W / 2, H - 18);
  }

  // Paddles
  drawPaddle(state.paddles[1], "#ff8f6b", "#ff6b4a");
  drawPaddle(state.paddles[0], "#7ef0d4", "#19c6c6");

  // Puck
  const puck = state.puck;
  const pulse = 1 + Math.sin(ts / 180) * 0.03;
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "#f2fbff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(10, 40, 50, 0.35)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(puck.x - 3, puck.y - 3, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();

  // Stale online hint
  if (mode === "online" && phase === "playing" && performance.now() - lastSnapshotAt > 2500) {
    ctx.fillStyle = "rgba(255, 200, 120, 0.85)";
    ctx.font = "600 13px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sinxron kutilyapti…", W / 2, H / 2);
  }
}

function drawPaddle(p, c0, c1) {
  const grd = ctx.createRadialGradient(p.x - 6, p.y - 6, 4, p.x, p.y, PADDLE_R);
  grd.addColorStop(0, c0);
  grd.addColorStop(1, c1);
  ctx.beginPath();
  ctx.arc(p.x, p.y, PADDLE_R, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, PADDLE_R * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(4, 21, 28, 0.35)";
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Deep-link from Mini App shell (?mode=ai|local|online&invite=…)
if (bootInvite) {
  startOnline(bootInvite);
} else if (bootMode === "ai" || bootMode === "local") {
  startOffline(bootMode);
} else if (bootMode === "online") {
  startOnline();
} else {
  showMenu();
}
requestAnimationFrame(frame);
