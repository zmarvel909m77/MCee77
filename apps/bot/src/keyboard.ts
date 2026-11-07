import { Keyboard } from "grammy";

/** Main reply keyboard labels (Uzbek Latin). */
export const BTN = {
  rocketBird: "🚀 Rocket Bird",
  airHockey: "🏒 Air Hockey",
  rating: "🏆 Reyting",
  profile: "👤 Profil",
} as const;

export function mainKeyboard(): Keyboard {
  return new Keyboard()
    .text(BTN.rocketBird)
    .text(BTN.airHockey)
    .row()
    .text(BTN.rating)
    .text(BTN.profile)
    .resized()
    .persistent();
}
