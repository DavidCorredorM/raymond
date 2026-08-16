import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The language setting (owner's ask: a UI-changeable "language parameter",
 * English default / Spanish second). Two things have to hold for a
 * non-technical owner to trust this: a typo'd or missing value never takes
 * the panel down (unlike a bad maxUploadBytes, this fails open — see the
 * comment in config.ts), and a UI-driven write never clobbers other fields
 * already sitting in config.json.
 *
 * Each test gets its own SBP_CONFIG path and vault dir rather than sharing
 * process.env mutation across tests running in the same process — node:test
 * runs a file's tests sequentially by default, but isolating the env still
 * keeps a failure in one test from leaving state the next one trips on.
 */

async function withTempConfig(
  fn: (cfgPath: string, vaultDir: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "raymond-config-test-"));
  const vaultDir = join(dir, "vault");
  await import("node:fs/promises").then((fs) => fs.mkdir(vaultDir, { recursive: true }));
  const cfgPath = join(dir, "config.json");
  const prevConfig = process.env.SBP_CONFIG;
  const prevVault = process.env.VAULT_DIR;
  const prevLang = process.env.RAYMOND_LANGUAGE;
  process.env.SBP_CONFIG = cfgPath;
  process.env.VAULT_DIR = vaultDir;
  delete process.env.RAYMOND_LANGUAGE;
  try {
    await fn(cfgPath, vaultDir);
  } finally {
    if (prevConfig === undefined) delete process.env.SBP_CONFIG;
    else process.env.SBP_CONFIG = prevConfig;
    if (prevVault === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = prevVault;
    if (prevLang === undefined) delete process.env.RAYMOND_LANGUAGE;
    else process.env.RAYMOND_LANGUAGE = prevLang;
    await rm(dir, { recursive: true, force: true });
  }
}

test("no config.json and no env var: language defaults to English", async () => {
  await withTempConfig(async () => {
    const { loadConfig } = await import(`./config.js?t=${Date.now()}-1`);
    const cfg = loadConfig();
    assert.equal(cfg.language, "en");
  });
});

test("RAYMOND_LANGUAGE=es selects Spanish", async () => {
  await withTempConfig(async () => {
    process.env.RAYMOND_LANGUAGE = "es";
    const { loadConfig } = await import(`./config.js?t=${Date.now()}-2`);
    const cfg = loadConfig();
    assert.equal(cfg.language, "es");
  });
});

test("an unrecognized language value falls back to English instead of crashing", async () => {
  await withTempConfig(async () => {
    process.env.RAYMOND_LANGUAGE = "fr";
    const { loadConfig } = await import(`./config.js?t=${Date.now()}-3`);
    assert.doesNotThrow(() => loadConfig());
    assert.equal(loadConfig().language, "en");
  });
});

test("writeLanguageSetting creates config.json when none exists, holding only language", async () => {
  await withTempConfig(async (cfgPath) => {
    const { writeLanguageSetting } = await import(`./config.js?t=${Date.now()}-4`);
    writeLanguageSetting("es");
    const written = JSON.parse(await readFile(cfgPath, "utf8"));
    assert.deepEqual(written, { language: "es" });
  });
});

test("writeLanguageSetting merges into an existing config.json rather than replacing it", async () => {
  await withTempConfig(async (cfgPath, vaultDir) => {
    await writeFile(cfgPath, JSON.stringify({ vaultDir, maxUploadBytes: 123 }));
    const { writeLanguageSetting } = await import(`./config.js?t=${Date.now()}-5`);
    writeLanguageSetting("es");
    const written = JSON.parse(await readFile(cfgPath, "utf8"));
    assert.equal(written.vaultDir, vaultDir);
    assert.equal(written.maxUploadBytes, 123);
    assert.equal(written.language, "es");
  });
});

test("a corrupt config.json is overwritten with a clean { language } rather than throwing", async () => {
  await withTempConfig(async (cfgPath) => {
    await writeFile(cfgPath, "{ not json");
    const { writeLanguageSetting } = await import(`./config.js?t=${Date.now()}-6`);
    assert.doesNotThrow(() => writeLanguageSetting("es"));
    const written = JSON.parse(await readFile(cfgPath, "utf8"));
    assert.deepEqual(written, { language: "es" });
  });
});

test("isSupportedLanguage accepts exactly en and es", async () => {
  const { isSupportedLanguage } = await import(`./config.js?t=${Date.now()}-7`);
  assert.equal(isSupportedLanguage("en"), true);
  assert.equal(isSupportedLanguage("es"), true);
  assert.equal(isSupportedLanguage("fr"), false);
  assert.equal(isSupportedLanguage(undefined), false);
  assert.equal(isSupportedLanguage(42), false);
});
