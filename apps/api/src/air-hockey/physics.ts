/** Shared Air Hockey rink physics (server + offline client mirror). */

export const RINK_W = 360;
export const RINK_H = 640;
export const PUCK_R = 14;
export const PADDLE_R = 28;
export const GOAL_WIDTH = 120;
export const FRICTION = 0.992;
export const MAX_PUCK_SPEED = 14;
export const WALL_BOUNCE = 0.92;
export const PADDLE_RESTITUTION = 1.05;
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

export interface Vec2 {
  x: number;
  y: number;
}

export interface PaddleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PuckState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SimState {
  puck: PuckState;
  paddles: [PaddleState, PaddleState];
  score: [number, number];
}

export function createInitialState(): SimState {
  return {
    puck: { x: RINK_W / 2, y: RINK_H / 2, vx: 0, vy: 0 },
    paddles: [
      { x: RINK_W / 2, y: RINK_H * 0.78, vx: 0, vy: 0 },
      { x: RINK_W / 2, y: RINK_H * 0.22, vx: 0, vy: 0 },
    ],
    score: [0, 0],
  };
}

export function clampPaddle(
  paddle: PaddleState,
  side: 0 | 1,
  targetX: number,
  targetY: number,
): void {
  const minY = side === 0 ? RINK_H * 0.52 : PADDLE_R + 8;
  const maxY = side === 0 ? RINK_H - PADDLE_R - 8 : RINK_H * 0.48;
  const nx = Math.min(RINK_W - PADDLE_R - 4, Math.max(PADDLE_R + 4, targetX));
  const ny = Math.min(maxY, Math.max(minY, targetY));
  paddle.vx = nx - paddle.x;
  paddle.vy = ny - paddle.y;
  paddle.x = nx;
  paddle.y = ny;
}

function collidePaddle(puck: PuckState, paddle: PaddleState): void {
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

/**
 * Advance one simulation tick. Returns which side scored (0 bottom, 1 top) or null.
 */
export function stepSim(state: SimState): 0 | 1 | null {
  const { puck } = state;
  puck.x += puck.vx;
  puck.y += puck.vy;
  puck.vx *= FRICTION;
  puck.vy *= FRICTION;

  const goalLeft = (RINK_W - GOAL_WIDTH) / 2;
  const goalRight = goalLeft + GOAL_WIDTH;

  // Side walls
  if (puck.x - PUCK_R < 0) {
    puck.x = PUCK_R;
    puck.vx = Math.abs(puck.vx) * WALL_BOUNCE;
  } else if (puck.x + PUCK_R > RINK_W) {
    puck.x = RINK_W - PUCK_R;
    puck.vx = -Math.abs(puck.vx) * WALL_BOUNCE;
  }

  // Top / bottom — goals vs boards
  if (puck.y - PUCK_R < 0) {
    if (puck.x > goalLeft && puck.x < goalRight) {
      return 0; // bottom player scored
    }
    puck.y = PUCK_R;
    puck.vy = Math.abs(puck.vy) * WALL_BOUNCE;
  } else if (puck.y + PUCK_R > RINK_H) {
    if (puck.x > goalLeft && puck.x < goalRight) {
      return 1; // top player scored
    }
    puck.y = RINK_H - PUCK_R;
    puck.vy = -Math.abs(puck.vy) * WALL_BOUNCE;
  }

  collidePaddle(puck, state.paddles[0]);
  collidePaddle(puck, state.paddles[1]);
  return null;
}

export function resetPuck(state: SimState, toward: 0 | 1): void {
  state.puck.x = RINK_W / 2;
  state.puck.y = RINK_H / 2;
  state.puck.vx = (Math.random() - 0.5) * 2.2;
  state.puck.vy = toward === 0 ? 3.2 : -3.2;
}

/** Simple AI: chase puck with lag on its half. */
export function aiTarget(state: SimState, difficulty = 0.72): Vec2 {
  const puck = state.puck;
  const paddle = state.paddles[1];
  const chaseX = paddle.x + (puck.x - paddle.x) * difficulty;
  let chaseY = RINK_H * 0.22;
  if (puck.y < RINK_H * 0.5) {
    chaseY = paddle.y + (puck.y - 36 - paddle.y) * (difficulty * 0.85);
  }
  return { x: chaseX, y: chaseY };
}
