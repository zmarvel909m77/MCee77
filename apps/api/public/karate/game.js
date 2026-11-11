```javascript
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#3a1a6e");
    sky.addColorStop(0.28, "#6b1f78");
    sky.addColorStop(0.55, "#c23a7a");
    sky.addColorStop(0.78, "#e85a8a");
    sky.addColorStop(1, "#2a1038");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

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

    ctx.fillStyle = "rgba(40, 12, 60, 0.35)";
    drawCloud(w * 0.18, baseY * 0.28, 48);
    drawCloud(w * 0.78, baseY * 0.22, 40);
    drawCloud(w * 0.55, baseY * 0.18, 28);

    ctx.fillStyle = "#1a0828";
    drawTorii(w * 0.22, baseY - 8, Math.min(90, w * 0.28));
    drawPagoda(w * 0.72, baseY - 4, Math.min(70, w * 0.2));
    drawPine(w * 0.08, baseY, 38);
    drawPine(w * 0.92, baseY, 44);
    drawPine(w * 0.38, baseY, 28);
    drawBush(w * 0.5, baseY, 36);
  }

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
  ground.addColorStop(0, "#2a1438");
  ground.addColorStop(0.2, "#1a0c24");
  ground.addColorStop(0.55, "#100818");
  ground.addColorStop(1, "#07040c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, baseY, w, Math.max(0, h - baseY));

  ctx.fillStyle = "rgba(255, 200, 220, 0.28)";
  ctx.fillRect(0, baseY - 1, w, 3);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, baseY + 2, w, 4);

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
  ctx.fillRect(cx - w * 0.35, baseY - h * 0.75, postW, h * 0.75);
  ctx.fillRect(cx + w * 0.35 - postW, baseY - h * 0.75, postW, h * 0.75);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, baseY - h * 0.78);
  ctx.quadraticCurveTo(cx, baseY - h * 0.92, cx + w * 0.5, baseY - h * 0.78);
  ctx.lineTo(cx + w * 0.48, baseY - h * 0.7);
  ctx.quadraticCurveTo(cx, baseY - h * 0.82, cx - w * 0.48, baseY - h * 0.7);
  ctx.closePath();
  ctx.fill();
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
  const bh = Math.min(18, Math.max(12, segH * 0.12));
  const by = y;
  const bw = trunkW * 2.15;
  const left = side === "left";
  const hx = left ? x - bw + 4 : x + trunkW - 4;
  roundRect(hx, by, bw, bh, 4, "#a67c52");
  ctx.strokeStyle = "rgba(70, 40, 20, 0.28)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const gy = by + 4 + i * (bh / 2.4);
    ctx.beginPath();
    ctx.moveTo(hx + 6, gy);
    ctx.lineTo(hx + bw - 6, gy + (i % 2));
    ctx.stroke();
  }
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
  const faceRight = side === "left";
  const key = heroFrameKey(now);
  const fr = HERO_ATLAS.frames[key] || HERO_ATLAS.frames.idle;

  const { heroH } = layout();
  const targetH =
    key === "defeat" ? heroH * 0.4 * scaleMul : heroH * scaleMul;
  const scale = targetH / fr.h;
  const dw = fr.w * scale;
  const dh = fr.h * scale;

  let bob = 0;
  let lift = 0;
  if (key === "idle") bob = Math.sin(animT * 3.2) * 1.4;
  if (key === "kick" || key === "punch") lift = 5;
  if (key === "hurt") lift = 10;

  const feetY = y + bob;
  const drawX = x;
  const drawY = feetY - dh - (key === "defeat" ? -2 : 0) - lift;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  const shadowW = key === "defeat" ? dw * 0.45 : Math.min(22, dw * 0.28);
  ctx.ellipse(drawX, feetY + 2, shadowW, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!heroReady) {
    ctx.fillStyle = "#f5f5f5";
    roundRect(drawX - 12, feetY - 56, 24, 56, 6, "#f5f5f5");
    ctx.fillStyle = "#111";
    roundRect(drawX - 10, feetY - 70, 20, 14, 3, "#111");
    return;
  }

  ctx.save();
  if (faceRight) {
    ctx.translate(drawX - dw / 2, drawY);
    ctx.drawImage(heroImg, fr.x, fr.y, fr.w, fr.h, 0, 0, dw, dh);
  } else {
    ctx.translate(drawX + dw / 2, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(heroImg, fr.x, fr.y, fr.w, fr.h, 0, 0, dw, dh);
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
  const dir = side === "left" ? 1 : -1;
  const chunkW = trunkW * 0.48;
  const chunkH = Math.min(26, Math.max(16, segH * 0.16));
  const mk = (scale, life, withBranch) => {
    const w = chunkW * scale;
    const h = chunkH * scale;
    return {
      x: cx + dir * (4 + Math.random() * 6),
      y: baseY - segH * (0.3 + Math.random() * 0.25),
      vx: dir * (180 + Math.random() * 140),
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
  const trunkW = Math.min(46, Math.max(40, w * 0.115));
  const groundH = Math.max(
    GROUND_MIN,
    Math.min(GROUND_MAX, Math.round(h * 0.09)),
  );
  const baseY = Math.max(groundH + 80, h - groundH);
  const treeH = Math.min(
    baseY,
    Math.max(
      h * TREE_HEIGHT_MIN_FRAC,
      Math.min(h * TREE_HEIGHT_MAX_FRAC, h * TREE_HEIGHT_FRAC),
    ),
  );
  const heroH = Math.max(
    h * TREE_HEIGHT_MIN_FRAC * HERO_OF_TREE_MIN,
    Math.min(
      treeH * HERO_OF_TREE_MAX,
      treeH * HERO_OF_TREE_FRAC,
    ),
  );
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
  const e = 1 - (1 - t) ** 3;
  trunkDropY = trunkDropAnim.from * (1 - e);
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
}

function draw(now) {
  const { w, h, cx, trunkW, segH, baseY, treeH } = layout();
  ctx.clearRect(0, 0, w, h);

  if (petals.length === 0) seedPetals(w, h);

  drawAtmosphere(w, h, baseY);

  roundRect(
    cx - trunkW * 0.65,
    baseY - 4,
    trunkW * 1.3,
    14,
    4,
    "#8a6238",
  );

  const dropY = sampleTrunkDropY(
    typeof now === "number" ? now : performance.now(),
  );
  const trunkX = cx - trunkW / 2;
  ctx.save();
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
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(196, 154, 108, 0.35)";
      ctx.fillRect(x, y, trunkW, segH + 1.5);
    }
    ctx.strokeStyle = "rgba(90, 50, 25, 0.2)";
    ctx.lineWidth = 1.35;
    for (let g = 0; g < 4; g++) {
      const gx = x + 10 + g * ((trunkW - 20) / 3.2);
      ctx.beginPath();
      ctx.moveTo(gx, y + 6);
      ctx.lineTo(gx + (g % 2 ? 1.4 : -1), y + segH - 4);
      ctx.stroke();
    }
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

  const playerY = baseY + 2;
  const sideGap = Math.max(32, trunkW * 0.52 + 10);
  const px =
    playerSide === "left" ? cx - trunkW / 2 - sideGap : cx + trunkW / 2 + sideGap;
  drawPlayer(px, playerY, playerSide, now);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.translate(0, baseY + 6);
  ctx.scale(1, -0.3);
  drawPlayer(px, -(playerY - baseY) + 4, playerSide, now, 0.92);
  ctx.restore();
  ctx.globalAlpha = 1;

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
**3-qism.** Ikkinchi qismning tagidan davom ettiring. Shu bilan `game.js` tugaydi.

```javascript
  trunk.shift();
  trunk.push(TreeBranchController.next(score + 1));
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
let audioCtx;
let noiseBuffer;

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function unlockAudio() {
  const ac = getAudioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
}

function getNoiseBuffer(ac) {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const len = Math.max(1, Math.floor(ac.sampleRate * 0.25));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

function envGain(ac, peak, attack, decay) {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function playChopTone() {
  if (muted) return;
  const ac = getAudioCtx();
  if (!ac) return;
  unlockAudio();

  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = envGain(ac, 0.12, 0.005, 0.12);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(75, t + 0.11);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);

  const noise = ac.createBufferSource();
  noise.buffer = getNoiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, t);
  const ng = envGain(ac, 0.08, 0.002, 0.09);
  noise.connect(filter);
  filter.connect(ng);
  ng.connect(ac.destination);
  noise.start(t);
  noise.stop(t + 0.1);
}

function playGameOverTone() {
  if (muted) return;
  const ac = getAudioCtx();
  if (!ac) return;
  unlockAudio();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = envGain(ac, 0.14, 0.01, 0.45);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.42);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.48);
}

async function submitScore() {
  if (submitting || lastSubmitted) return;
  submitting = true;
  submitStatus.textContent = "Natija saqlanmoqda...";
  submitStatus.classList.remove("error", "ok");

  try {
    const payload = await waitForAuthPayload();
    if (!payload) {
      submitStatus.textContent = "Telegram tasdiqlash ma’lumoti topilmadi.";
      submitStatus.classList.add("error");
      return;
    }

    const response = await fetch("/api/v1/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, score }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Natijani saqlab bo‘lmadi");
    }

    best = Math.max(best, Number(data.bestScore) || score);
    hudBest.textContent = String(best);
    submitStatus.textContent = "Natija saqlandi";
    submitStatus.classList.add("ok");
    lastSubmitted = true;
  } catch (error) {
    console.error("Score submit error:", error);
    submitStatus.textContent = error.message || "Server bilan aloqa yo‘q";
    submitStatus.classList.add("error");
  } finally {
    submitting = false;
  }
}

async function loadMe() {
  try {
    const payload = await waitForAuthPayload();
    if (!payload) return;

    const response = await fetch("/api/v1/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return;
    const data = await response.json();
    best = Number(data.bestScore) || 0;
    hudBest.textContent = String(best);
  } catch (error) {
    console.warn("Profile load error:", error);
  }
}

function endGame(reason = "") {
  if (phase === "over" || phase === "dying") return;
  phase = "dying";
  pendingOverReason = reason;
  deathStartedAt = performance.now();
  chopping = false;
  playGameOverTone();

  setTimeout(() => {
    if (phase !== "dying") return;
    phase = "over";
    showOverlay("O‘yin tugadi", reason, "Qayta o‘ynash");
    void submitScore();
  }, HURT_MS + DEFEAT_HOLD_MS);
}

function startGame() {
  resetRun();
  phase = "playing";
  hideOverlay();
  unlockAudio();
  lastTs = performance.now();
}

function togglePause() {
  if (phase === "playing") {
    phase = "paused";
    btnPause.textContent = "Davom etish";
  } else if (phase === "paused") {
    phase = "playing";
    btnPause.textContent = "Pauza";
    lastTs = performance.now();
  }
}

function update(dt) {
  if (phase !== "playing") return;

  animT += dt;
  if (graceLeft > 0) {
    graceLeft = Math.max(0, graceLeft - dt);
  } else {
    const { drainScale } = difficultyFor(score);
    energy = Math.max(0, energy - ENERGY_DRAIN * drainScale * dt);
    if (energy <= 0) {
      setEnergyUi();
      endGame("Quvvat tugadi!");
      return;
    }
  }

  if (chopping && performance.now() >= chopUntil) {
    chopping = false;
    heroPose = "idle";
  }

  multiFill = Math.max(0, multiFill - MULTI_DECAY * dt);
  multi = 1 + multiFill * (MULTI_MAX - 1);

  updateTrunkDrop(dt);
  setEnergyUi();
  setMultiUi();

  for (const p of petals) {
    p.x += Math.sin(animT * 1.4 + p.rot) * 0.25;
    p.y += p.vy;
    p.rot += p.vr;
    if (p.y > canvas.clientHeight + 10) {
      p.y = -10;
      p.x = Math.random() * canvas.clientWidth;
    }
  }

  for (const d of debris) {
    if (d.grounded) continue;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += DEBRIS_GRAVITY * dt;
    d.rot += d.vr * dt;
    d.life -= dt;
    if (d.y > canvas.clientHeight - 35) {
      d.y = canvas.clientHeight - 35;
      d.grounded = true;
    }
  }
  debris = debris.filter((d) => d.life > 0);

  for (const c of chips) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += DEBRIS_GRAVITY * 0.7 * dt;
    c.a -= dt * 1.4;
  }
  chips = chips.filter((c) => c.a > 0);

  for (const f of floats) {
    f.y += f.vy;
    f.life -= dt * 1.5;
  }
  floats = floats.filter((f) => f.life > 0);
}

let shotFreeze = false;

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(DT_MAX, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;

  if (!shotFreeze) update(dt);
  draw(ts);

  requestAnimationFrame(frame);
}

function onPointerDown(event) {
  if (phase === "ready" || phase === "over") {
    startGame();
    return;
  }
  if (phase !== "playing") return;

  unlockAudio();
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  chop(x < rect.width / 2 ? "left" : "right");
}

canvas.addEventListener("pointerdown", onPointerDown);

primaryBtn.addEventListener("click", () => {
  if (phase === "ready" || phase === "over") startGame();
});

btnMute.addEventListener("click", () => {
  muted = !muted;
  btnMute.textContent = muted ? "Ovoz yoqish" : "Ovozni o‘chirish";
});

btnPause.addEventListener("click", togglePause);

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);

if (tg) {
  tg.onEvent?.("viewportChanged", resize);
}

resize();
void loadMe();
requestAnimationFrame(frame);
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
