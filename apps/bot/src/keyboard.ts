import { Keyboard } from "grammy";
import type { FeatureFlags } from "@mcee77/shared";

/** Main reply keyboard labels (Uzbek Latin). */
export const BTN = {
  play: "🏒 O‘ynash",
  open: "OCHISH",
  rating: "🏆 Reyting",
  profile: "👤 Profil",
} as const;

export interface MainKeyboardOptions {
  flags?: FeatureFlags;
  /** When set, top button opens the Mini App via Telegram WebApp. */
  miniAppUrl?: string;
}

/**
 * Compact reply keyboard — Mini App is the primary entry.
 * Omits sections disabled by admin feature flags.
 */
export function mainKeyboard(opts?: MainKeyboardOptions | FeatureFlags): Keyboard {
  const normalized: MainKeyboardOptions =
    opts && "air_hockey" in (opts as FeatureFlags) && !("flags" in (opts as object))
      ? { flags: opts as FeatureFlags }
      : ((opts as MainKeyboardOptions) ?? {});

  const f = normalized.flags ?? {
    air_hockey: true,
    rating: true,
    profile: true,
    mini_app: true,
  };
  const miniAppUrl = normalized.miniAppUrl?.trim() ?? "";

  const kb = new Keyboard();
  if ((f.air_hockey || f.mini_app) && miniAppUrl) {
    kb.webApp(BTN.open, miniAppUrl).row();
    kb.text(BTN.play).row();
  } else if (f.air_hockey || f.mini_app) {
    kb.text(BTN.play).row();
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
