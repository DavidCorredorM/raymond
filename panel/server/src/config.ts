import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

/**
 * UI chrome language (panel/web/src/i18n). Not the vault's own language —
 * notes, frontmatter and trick content stay whatever the deployment's
 * owner writes them in (roadmap #8's reasoning, applied to a second
 * field). Two values because that's what the owner asked to support; the
 * lookup-table mechanism in panel/web doesn't need a third to be added
 * here first, but the config layer only promises what's actually wired.
 */
export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(v: unknown): v is Language {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

export interface Config {
  /** Absolute path to the markdown vault. Never hardcoded — see README. */
  vaultDir: string;
  port: number;
  host: string;
  /** Directories inside the vault the index ignores entirely. */
  ignore: string[];
  /** Hard ceiling on a single attachment upload, in bytes. */
  maxUploadBytes: number;
  /**
   * UI chrome language. Mutable at runtime (see `writeLanguageSetting`)
   * unlike every other field here — those are bootstrap parameters a
   * restart is a reasonable price for changing; language is the one
   * thing the owner's ask explicitly asked to be changeable from the UI
   * itself, by someone who won't SSH in to edit a file by hand.
   */
  language: Language;
}

const DEFAULTS = {
  port: 8710,
  // Bind to all interfaces so the Tailscale address reaches it. The
  // tailnet is the security perimeter; this must never face the public
  // internet without an auth layer in front.
  host: "0.0.0.0",
  ignore: [".git", ".obsidian", "node_modules", ".trash"],
  // 25 MB. Decided up front rather than discovered by an accidental
  // upload (roadmap #9). Big enough for the real driver — a generated
  // PDF/Excel report someone wants to look at — and small enough that
  // anything on the tailnet filling the disk takes deliberate effort.
  // Enforced by the multipart parser as it streams, not after buffering.
  maxUploadBytes: 25 * 1024 * 1024,
  // English, because that's what every skill, error message and doc in
  // this repo is written in — a fresh deployment with nothing configured
  // should look like the codebase it came from, not guess at Spanish.
  language: "en" as Language,
};

function expandHome(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : p;
}

/**
 * Same resolution `loadConfig` uses for reading, exposed so a write path
 * (the settings endpoint) targets the exact same file — two independent
 * guesses at "where is config.json" is how they'd drift.
 */
export function resolveConfigPath(): string {
  return process.env.SBP_CONFIG ?? resolve(process.cwd(), "config.json");
}

export function loadConfig(): Config {
  let fileCfg: Partial<Config> = {};
  const cfgPath = resolveConfigPath();
  if (existsSync(cfgPath)) {
    fileCfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  }

  const raw = process.env.VAULT_DIR ?? fileCfg.vaultDir;
  if (!raw) {
    throw new Error(
      "No vault configured. Set VAULT_DIR or add vaultDir to config.json.",
    );
  }

  const vaultDir = resolve(expandHome(raw));
  if (!isAbsolute(vaultDir)) {
    throw new Error(`vaultDir must resolve to an absolute path: ${vaultDir}`);
  }
  if (!existsSync(vaultDir)) {
    throw new Error(`Vault does not exist: ${vaultDir}`);
  }

  // A bad value here silently disables the upload ceiling (NaN compares
  // false against everything), so it fails loudly instead.
  const rawMax = process.env.RAYMOND_MAX_UPLOAD_BYTES ?? fileCfg.maxUploadBytes;
  const maxUploadBytes = rawMax === undefined ? DEFAULTS.maxUploadBytes : Number(rawMax);
  if (!Number.isInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new Error(
      `maxUploadBytes must be a positive integer number of bytes, got: ${rawMax}`,
    );
  }

  // Unlike maxUploadBytes above, a bad value here has no dangerous silent
  // failure mode (there's no NaN-compares-false trap), and this is the one
  // setting a non-technical owner can trip on their own by mistyping an
  // env var — so it fails *open*, to English, rather than taking the whole
  // panel down over a typo. A fresh deployment with nothing configured and
  // a deployment with `RAYMOND_LANGUAGE=xx` both land here, on purpose.
  const rawLanguage = process.env.RAYMOND_LANGUAGE ?? fileCfg.language;
  const language: Language = isSupportedLanguage(rawLanguage) ? rawLanguage : DEFAULTS.language;

  return {
    vaultDir,
    port: Number(process.env.PORT ?? fileCfg.port ?? DEFAULTS.port),
    host: process.env.HOST ?? fileCfg.host ?? DEFAULTS.host,
    ignore: fileCfg.ignore ?? DEFAULTS.ignore,
    maxUploadBytes,
    language,
  };
}

/**
 * The write half of the language setting (owner's ask: "allows our
 * customers to set their language easily", not just a bootstrap-time
 * choice). Rule 1 (README) says files are the only state, so this is a
 * `config.json` write, not a database row — same file `loadConfig` reads,
 * merged rather than overwritten so a hand-edited `vaultDir` or
 * `maxUploadBytes` living in that file survives a language change made
 * from the UI.
 *
 * A deployment with no `config.json` yet (fully env-var driven) gets one
 * created holding just `{ language }` — a smaller file than a deployment
 * that already has one, and a valid one, which is the point: this only
 * ever adds a key, never invents values for fields it wasn't told.
 *
 * Callers still need to update the in-memory `Config` themselves (see
 * `index.ts`'s settings endpoint) — this function only persists the file;
 * it doesn't reach into a running server's `cfg` object, which would
 * couple a pure file-write helper to one particular caller's state shape.
 */
export function writeLanguageSetting(language: Language): void {
  const cfgPath = resolveConfigPath();
  let existing: Record<string, unknown> = {};
  if (existsSync(cfgPath)) {
    try {
      existing = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      // A corrupt config.json is a pre-existing problem this write didn't
      // cause; overwriting it with a clean `{ language }` is a better
      // outcome than refusing to save the one thing the user just asked
      // for, or propagating a parse error up into a 500.
      existing = {};
    }
  }
  existing.language = language;
  writeFileSync(cfgPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
}
