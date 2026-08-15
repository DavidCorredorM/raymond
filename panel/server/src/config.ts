import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

export interface Config {
  /** Absolute path to the markdown vault. Never hardcoded — see README. */
  vaultDir: string;
  port: number;
  host: string;
  /** Directories inside the vault the index ignores entirely. */
  ignore: string[];
}

const DEFAULTS = {
  port: 8710,
  // Bind to all interfaces so the Tailscale address reaches it. The
  // tailnet is the security perimeter; this must never face the public
  // internet without an auth layer in front.
  host: "0.0.0.0",
  ignore: [".git", ".obsidian", "node_modules", ".trash"],
};

function expandHome(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : p;
}

export function loadConfig(): Config {
  let fileCfg: Partial<Config> = {};
  const cfgPath = process.env.SBP_CONFIG ?? resolve(process.cwd(), "config.json");
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

  return {
    vaultDir,
    port: Number(process.env.PORT ?? fileCfg.port ?? DEFAULTS.port),
    host: process.env.HOST ?? fileCfg.host ?? DEFAULTS.host,
    ignore: fileCfg.ignore ?? DEFAULTS.ignore,
  };
}
