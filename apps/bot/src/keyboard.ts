import { InlineKeyboard } from "grammy";

/** Inline button labels (Uzbek Latin). */
export const BTN = {
  play: "🥋 O‘ynash",
  shop: "🛒 Magazin",
  open: "OCHISH",
} as const;

export const CB = {
  shop: "shop",
} as const;

export interface StartInlineOptions {
  /** Mini App shell URL (`…/app/`). When empty, play button falls back to callback hint. */
  miniAppUrl?: string;
  /** Optional shop Mini App page (`…/app/shop/`). */
  shopUrl?: string;
}

/**
 * Stacked inline keyboard under /start.
 * No reply keyboard.
 */
export function startInlineKeyboard(opts: StartInlineOptions = {}): InlineKeyboard {
  const mini = opts.miniAppUrl?.trim() ?? "";
  const shop = opts.shopUrl?.trim() ?? "";
  const kb = new InlineKeyboard();

  if (mini) {
    kb.webApp(BTN.play, mini).row();
  } else {
    kb.text(BTN.play, "play_no_webapp").row();
  }

  if (shop) {
    kb.webApp(BTN.shop, shop);
  } else {
    kb.text(BTN.shop, CB.shop);
  }

  return kb;
}

/** ReplyKeyboardRemove payload — clears legacy bottom menu. */
export const REMOVE_REPLY_KEYBOARD = {
  remove_keyboard: true as const,
};
