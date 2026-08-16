import { create } from "zustand";
import type { Language } from "../api/types";
import { en, es, type Messages } from "./messages";

const DICTS: Record<Language, Messages> = { en, es };

interface I18nStore {
  /**
   * Defaults to English before the first `GET /api/health` response lands
   * (App.tsx's LanguageSync) — matches the server's own default (config.ts
   * DEFAULTS.language), so a slow first load never flashes a language
   * nobody configured.
   */
  language: Language;
  setLanguage: (language: Language) => void;
}

/**
 * Global, not component state: the language selector lives in Settings,
 * but almost every route reads it — the same shape as `editorStore.ts`'s
 * reasoning (cross-cutting state with no natural parent/child owner is a
 * store, not a prop drilled through the route tree).
 */
export const useI18nStore = create<I18nStore>()((set) => ({
  language: "en",
  setLanguage: (language) => set({ language }),
}));

/** The hook every component uses: `const t = useT();` then `t.note.save`. */
export function useT(): Messages {
  const language = useI18nStore((s) => s.language);
  return DICTS[language] ?? DICTS.en;
}

/**
 * For the handful of call sites that are plain functions, not components —
 * `describeUploadError` (lib/attachments.ts) and the unsaved-changes
 * `window.confirm` prompt (editor/useUnsavedChangesGuard.ts) — and so
 * can't call a hook. Reads the store's current value directly; zustand
 * stores support this outside React by design.
 */
export function currentMessages(): Messages {
  return DICTS[useI18nStore.getState().language] ?? DICTS.en;
}
