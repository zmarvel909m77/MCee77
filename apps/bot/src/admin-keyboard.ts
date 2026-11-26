import { Keyboard } from "grammy";

/** Admin reply-keyboard labels (only shown to allowlisted ids). */
export const ADMIN_BTN = {
  stats: "📊 STATISTIKA",
  rating: "🏆 REYTING",
  broadcast: "📢 HAMMAGA YUBORISH",
  resetStart: "🔄 Yangi /START YUBORISH",
  cancel: "❌ BEKOR QILISH",
} as const;

export function adminKeyboard(): Keyboard {
  return new Keyboard()
    .text(ADMIN_BTN.stats)
    .text(ADMIN_BTN.rating)
    .row()
    .text(ADMIN_BTN.broadcast)
    .text(ADMIN_BTN.resetStart)
    .resized()
    .persistent();
}

export function adminBroadcastKeyboard(): Keyboard {
  return new Keyboard()
    .text(ADMIN_BTN.cancel)
    .resized()
    .persistent();
}
