import { Keyboard } from "grammy";
import type { FeatureFlags } from "@mcee77/shared";

/** Main reply keyboard labels (Uzbek Latin). */
export const BTN = {
  rocketBird: "🚀 Rocket Bird",
  airHockey: "🏒 Air Hockey",
  rating: "🏆 Reyting",
  profile: "👤 Profil",
} as const;

/**
 * Build the main reply keyboard, omitting sections that are disabled.
 * If every section is off, returns an empty resized keyboard (no ads).
 */
export function mainKeyboard(flags?: FeatureFlags): Keyboard {
  const f = flags ?? {
    rocket_bird: true,
    air_hockey: true,
    rating: true,
    profile: true,
  };

  const kb = new Keyboard();
  const games: string[] = [];
  if (f.rocket_bird) games.push(BTN.rocketBird);
  if (f.air_hockey) games.push(BTN.airHockey);
  if (games.length === 1) {
    kb.text(games[0]!);
    kb.row();
  } else if (games.length === 2) {
    kb.text(games[0]!).text(games[1]!);
    kb.row();
  }

  const meta: string[] = [];
  if (f.rating) meta.push(BTN.rating);
  if (f.profile) meta.push(BTN.profile);
  if (meta.length === 1) {
    kb.text(meta[0]!);
  } else if (meta.length === 2) {
    kb.text(meta[0]!).text(meta[1]!);
  }

  return kb.resized().persistent();
}
