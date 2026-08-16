import { useState } from "react";
import type { Language } from "../api/types";
import { useSetLanguage } from "../api/queries";
import { useI18nStore, useT } from "../i18n/store";

/**
 * The one deployment setting a non-technical owner can change without
 * SSHing in (owner's ask: "allows our customers to set their language
 * easily"). A `/settings` route rather than folding this into Health or
 * Vault: neither of those was an obvious home, and nothing in the app had
 * a settings surface before this — see the language-setting agent's
 * report for the survey that turned up nothing to reuse.
 *
 * Applies the new language to the store the instant the write succeeds
 * (not waiting on useHealth's next 30s poll — App.tsx's LanguageSync
 * covers *other* tabs, this covers the one the user is looking at right
 * now) — no page reload needed, matching the owner's "should not restart
 * the whole service" instruction extended to "should not even need a
 * reload" where that's cheap to give.
 */
export function SettingsRoute() {
  const t = useT();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const mutation = useSetLanguage();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function choose(next: Language) {
    if (next === language) return;
    setStatus("idle");
    try {
      const result = await mutation.mutateAsync(next);
      setLanguage(result.language);
      setStatus("saved");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  }

  return (
    <div className="settings-route page-scroll">
      <h1>{t.settings.title}</h1>
      <p className="muted">{t.settings.description}</p>

      <fieldset className="settings-language" disabled={mutation.isPending}>
        <legend>{t.settings.languageLabel}</legend>
        <label className="settings-language-option">
          <input
            type="radio"
            name="language"
            value="en"
            checked={language === "en"}
            onChange={() => void choose("en")}
          />
          {t.settings.english}
        </label>
        <label className="settings-language-option">
          <input
            type="radio"
            name="language"
            value="es"
            checked={language === "es"}
            onChange={() => void choose("es")}
          />
          {t.settings.spanish}
        </label>
      </fieldset>

      {mutation.isPending && <p className="muted">{t.settings.saving}</p>}
      {!mutation.isPending && status === "saved" && <p className="muted">{t.settings.saved}</p>}
      {!mutation.isPending && status === "error" && (
        <p className="note-error">{t.settings.saveFailed(errorMsg)}</p>
      )}
    </div>
  );
}
