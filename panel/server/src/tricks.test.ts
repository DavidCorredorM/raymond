import { test } from "node:test";
import assert from "node:assert/strict";
import { appRequestGate, appContentType, resolveAppFile, TrickError } from "./tricks.js";

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
