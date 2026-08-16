import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appRequestGate,
  appContentType,
  listTricks,
  readTrickManifest,
  resolveAppFile,
  TrickError,
} from "./tricks.js";

/**
 * The two pure functions that decide who gets a trick's app and which
 * file they get. Both are tested here rather than only through the route
 * because both have a failure mode that is silent in a browser: the gate
 * fails closed (a trick "just doesn't render") and the resolver fails
 * open (a file leaks with a 200).
 */

const VAULT = "/vault";

test("the panel mounting a trick in its iframe is the one allowed way in", () => {
  assert.equal(appRequestGate("iframe", "same-origin").ok, true);
  assert.equal(appRequestGate("frame", "same-origin").ok, true);
});

test("a trick app opened as a page is refused — a top-level sandboxed document can navigate itself", () => {
  assert.equal(appRequestGate("document", "none").ok, false);
  assert.equal(appRequestGate("document", "same-origin").ok, false);
});

test("one trick frame navigating into another trick's app reports cross-site, and is refused", () => {
  assert.equal(appRequestGate("iframe", "cross-site").ok, false);
  assert.equal(appRequestGate("iframe", "same-site").ok, false);
  assert.equal(appRequestGate("iframe", undefined).ok, false);
});

test("a client that sends no Sec-Fetch-Dest is not a browser, and fails closed", () => {
  assert.equal(appRequestGate(undefined, "same-origin").ok, false);
  assert.equal(appRequestGate("", "same-origin").ok, false);
  assert.equal(appRequestGate(42, "same-origin").ok, false);
});

test("subresources are NOT gated on Sec-Fetch-Site — they all report cross-site", () => {
  // The wrong version of this rule 403s every asset an app loads, and
  // because the body is JSON with nosniff the symptom is "fetched but
  // never executes" (spec §10.6). This test is the fence around it.
  for (const dest of ["script", "style", "image", "font", "audio", "video", "empty", "object"]) {
    assert.equal(appRequestGate(dest, "cross-site").ok, true, `${dest} must be served`);
  }
});

test("an empty remainder is the manifest's entrada, and a trailing slash is that folder's index", () => {
  assert.equal(resolveAppFile(VAULT, "g", "", "index.html").rel, "index.html");
  assert.equal(resolveAppFile(VAULT, "g", "", "panel.html").rel, "panel.html");
  assert.equal(resolveAppFile(VAULT, "g", "sub/", "index.html").rel, "sub/index.html");
  assert.equal(resolveAppFile(VAULT, "g", "sub/x.css", "index.html").rel, "sub/x.css");
});

test("nothing above app/ is reachable, whatever spelling the escape uses", () => {
  const escapes = [
    "../trick.yaml",
    "../../hostil/app/h.js",
    "../../../../notas/secreto.md",
    "sub/../../trick.yaml",
    "sub/../../../skills/x/SKILL.md",
  ];
  for (const e of escapes) {
    assert.throws(() => resolveAppFile(VAULT, "g", e, "index.html"), TrickError, e);
  }
});

test("a leading slash is stripped rather than treated as filesystem-absolute", () => {
  assert.equal(resolveAppFile(VAULT, "g", "/etc/passwd", "index.html").rel, "etc/passwd");
});

test("a NUL byte in the path is refused before anything touches disk", () => {
  assert.throws(() => resolveAppFile(VAULT, "g", "a\0.html", "index.html"), TrickError);
});

test("an unsafe trick name never becomes a path", () => {
  assert.throws(() => resolveAppFile(VAULT, "../../etc", "x", "index.html"), TrickError);
  assert.throws(() => resolveAppFile(VAULT, "..", "x", "index.html"), TrickError);
});

test("content types come from an allowlist and are never sniffed", () => {
  assert.equal(appContentType("index.html"), "text/html; charset=utf-8");
  assert.equal(appContentType("app.js"), "text/javascript; charset=utf-8");
  assert.equal(appContentType("mod.mjs"), "text/javascript; charset=utf-8");
  assert.equal(appContentType("a/b/logo.svg"), "image/svg+xml");
  // Unknown types are octet-stream, which with nosniff means the browser
  // refuses to interpret them — the right failure for a type nobody
  // thought about.
  assert.equal(appContentType("weird.xyz"), "application/octet-stream");
  assert.equal(appContentType("noextension"), "application/octet-stream");
});

// ---------------------------------------------------------------------------
// There is one kind of trick. These tests are the fence around the v1
// deletion: a manifest in the old fixed-vocabulary shape must fail the way
// any other invalid manifest fails — skipped from the listing with a
// logged reason — and must never reach a second renderer.
// ---------------------------------------------------------------------------

async function scratchVault(tricks: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "raymond-tricks-"));
  for (const [name, yaml] of Object.entries(tricks)) {
    await mkdir(join(dir, ".claude/tricks", name, "app"), { recursive: true });
    await writeFile(join(dir, ".claude/tricks", name, "trick.yaml"), yaml);
    await writeFile(join(dir, ".claude/tricks", name, "app/index.html"), "<p>hi</p>");
  }
  return dir;
}

const V1_MANIFEST = `titulo: "Old"
datos:
  carpeta: "notas"
ui:
  layout: lista
  campos:
    - campo: estado
      control: lista
acciones:
  - etiqueta: "Archive"
    control: boton
    accion:
      archivar: true
`;

const V2_MANIFEST = `titulo: "New"
app:
  entrada: "index.html"
  alto: 300
capacidades:
  estado:
    max_bytes: 1024
`;

test("a v1 manifest has no app: block, so it is simply invalid", async () => {
  const dir = await scratchVault({ viejo: V1_MANIFEST });
  await assert.rejects(() => readTrickManifest(dir, "viejo"), TrickError);
});

test("an invalid manifest is skipped from the listing, with the reason handed to the caller to log", async () => {
  const dir = await scratchVault({ viejo: V1_MANIFEST, nuevo: V2_MANIFEST });
  const skipped: string[] = [];
  const list = await listTricks(dir, (name) => skipped.push(name));
  assert.deepEqual(
    list.map((t) => t.name),
    ["nuevo"],
  );
  assert.deepEqual(skipped, ["viejo"]);
  // No `tipo` discriminator any more: there is nothing to discriminate.
  assert.equal("tipo" in list[0], false);
  assert.equal(list[0].alto, 300);
  assert.deepEqual(list[0].capacidades, ["estado"]);
});

test("the deleted action verbs are not a vocabulary the manifest can still name", async () => {
  // `set`/`crear_nota`/`archivar` used to validate and do nothing. They
  // now fall through `.passthrough()` unread — the point of the test is
  // that `correr_script` is the only thing `runTrickAction` can find, so
  // an action declaring only `archivar:` is not runnable rather than
  // silently accepted as one.
  const dir = await scratchVault({
    x: `${V2_MANIFEST}acciones:
  - etiqueta: "Archive"
    accion:
      archivar: true
`,
  });
  const manifest = await readTrickManifest(dir, "x");
  assert.equal(manifest.acciones?.[0]?.accion?.correr_script, undefined);
});

test("app.alto defaults, and app: with nothing in it is still an app trick", async () => {
  const dir = await scratchVault({ x: 'titulo: "T"\napp: {}\n' });
  const manifest = await readTrickManifest(dir, "x");
  assert.equal(manifest.app.entrada, "index.html");
  assert.equal(manifest.app.alto, 480);
  assert.deepEqual(manifest.capacidades, {});
});
