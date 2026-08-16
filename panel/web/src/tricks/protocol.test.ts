import { describe, expect, test } from "vitest";
import {
  byteLength,
  denyReason,
  diffScope,
  envelopeFromServer,
  LIMITS,
  opCapability,
  parseFrameMessage,
  scopeFolders,
  snapshotScope,
  TokenBucket,
} from "./protocol";

/**
 * The host is the piece holding the capability port, so the parts of it
 * that are decisions rather than DOM calls are tested here directly. The
 * browser-level attacks (self-navigation, `parent.document`, a message
 * claiming another trick's name) are in `docs/log.md` — they need a real
 * opaque origin and cannot be reproduced in a unit test.
 */

describe("envelope validation (§6.4) — malformed messages are dropped, never answered", () => {
  test("a well-formed request parses, and params default to an empty object", () => {
    const r = parseFrameMessage({ v: 1, id: "q7", op: "vault.query" });
    expect(r).toEqual({ ok: true, request: { id: "q7", op: "vault.query", params: {} } });
  });

  test("a missing or unknown protocol version is dropped", () => {
    expect(parseFrameMessage({ id: "a", op: "vault.query" }).ok).toBe(false);
    expect(parseFrameMessage({ v: 2, id: "a", op: "vault.query" }).ok).toBe(false);
    expect(parseFrameMessage({ v: "1", id: "a", op: "vault.query" }).ok).toBe(false);
  });

  test("a missing id is dropped — the host has nothing to correlate an answer to", () => {
    expect(parseFrameMessage({ v: 1, op: "vault.query" }).ok).toBe(false);
  });

  test("a non-string op is dropped", () => {
    expect(parseFrameMessage({ v: 1, id: 1, op: 42 }).ok).toBe(false);
    expect(parseFrameMessage({ v: 1, id: 1, op: "" }).ok).toBe(false);
  });

  test("an object or array id is refused: it would be echoed, and it is not a scalar", () => {
    expect(parseFrameMessage({ v: 1, id: { toString: 1 }, op: "estado.get" }).ok).toBe(false);
    expect(parseFrameMessage({ v: 1, id: ["a"], op: "estado.get" }).ok).toBe(false);
  });

  test("__proto__ as an id is accepted as a *string* and is harmless — pending is a Map", () => {
    // The danger is only real if the host stores pending state on a plain
    // object. It stores it in a Map, so this is data like any other and
    // the string round-trips untouched.
    const r = parseFrameMessage({ v: 1, id: "__proto__", op: "estado.get" });
    expect(r.ok).toBe(true);
    const pending = new Map<string | number, number>();
    pending.set("__proto__", 1);
    expect(pending.get("__proto__")).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("params must be an object, not an array or a scalar", () => {
    expect(parseFrameMessage({ v: 1, id: 1, op: "x", params: [1, 2] }).ok).toBe(false);
    expect(parseFrameMessage({ v: 1, id: 1, op: "x", params: "hi" }).ok).toBe(false);
  });

  test("a message body claiming another trick carries no weight — there is no trick field to read", () => {
    const r = parseFrameMessage({ v: 1, id: "x", op: "estado.get", trick: "pinta" });
    expect(r.ok).toBe(true);
    expect(r.ok && "trick" in r.request).toBe(false);
  });
});

describe("capability check (§7) — the host's fast first line, not the fence", () => {
  test("estado is one manifest key granting two ops", () => {
    expect(opCapability("estado.get")).toBe("estado");
    expect(opCapability("estado.set")).toBe("estado");
  });

  test("everything else is one-to-one", () => {
    for (const op of ["vault.query", "vault.read", "vault.write", "script.run", "trabajo.estado"]) {
      expect(opCapability(op)).toBe(op);
    }
  });

  test("an op outside the vocabulary is unsupported_op, not capability_denied", () => {
    // The difference matters: capability_denied sends an author hunting a
    // manifest bug that is not there.
    expect(denyReason("g", "vault.delete", new Set(["vault.write"]))?.code).toBe("unsupported_op");
    expect(opCapability("constructor")).toBe(null);
    expect(opCapability("__proto__")).toBe(null);
  });

  test("an undeclared capability is denied, and the message names what was missing", () => {
    const d = denyReason("gastos", "vault.write", new Set(["vault.query"]));
    expect(d?.code).toBe("capability_denied");
    expect(d?.message).toBe("gastos did not declare vault.write");
  });

  test("a declared capability passes", () => {
    expect(denyReason("g", "estado.set", new Set(["estado"]))).toBe(null);
  });

  test("no declarations at all denies everything", () => {
    for (const op of ["vault.query", "estado.get", "script.run"]) {
      expect(denyReason("g", op, new Set())?.code).toBe("capability_denied");
    }
  });
});

describe("rate limiting (§6.6)", () => {
  test("burst is spent, then refilled at the declared rate", () => {
    const bucket = new TokenBucket(20, 40, 0);
    for (let i = 0; i < 40; i++) expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(false);
    // 20/s means one token back after 50ms.
    expect(bucket.take(50)).toBe(true);
    expect(bucket.take(50)).toBe(false);
    // A second of idling refills 20, not more than the burst.
    expect(bucket.take(10_000)).toBe(true);
  });

  test("the ceiling is the burst, not unbounded credit for being idle", () => {
    const bucket = new TokenBucket(20, 40, 0);
    let taken = 0;
    while (bucket.take(1_000_000)) taken++;
    expect(taken).toBe(40);
  });

  test("byteLength counts UTF-8 bytes, which is what a size limit means", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("💸")).toBe(4);
    expect(LIMITS.maxMessageBytes).toBe(262144);
  });
});

describe("server answers become envelopes the frame can trust", () => {
  test("a success is relayed with the frame's own id", () => {
    expect(envelopeFromServer("q1", 200, { v: 1, id: "whatever", ok: true, result: { a: 1 } })).toEqual(
      { v: 1, id: "q1", ok: true, result: { a: 1 } },
    );
  });

  test("a 403 body is read, and its code is the contract", () => {
    expect(
      envelopeFromServer(7, 403, {
        v: 1,
        ok: false,
        error: { code: "capability_denied", message: "nope" },
      }),
    ).toEqual({ v: 1, id: 7, ok: false, error: { code: "capability_denied", message: "nope" } });
  });

  test("a body that is not an envelope at all becomes internal, not a made-up code", () => {
    // Fastify's own 413, a proxy's HTML error page, an empty body.
    const e = envelopeFromServer("x", 413, { statusCode: 413, error: "Payload Too Large" });
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.error.code).toBe("internal");
    expect(envelopeFromServer("x", 502, null).ok).toBe(false);
  });

  test("an unknown error code from a future server is not passed through as if known", () => {
    const e = envelopeFromServer("x", 418, { ok: false, error: { code: "teapot" } });
    expect(e.ok === false && e.error.code).toBe("internal");
  });
});

describe("freshness scope (§8) — an app must be correct after an overnight run", () => {
  const caps = {
    "vault.query": { carpeta: ".claude/tricks/g/data", limite: 200 },
    "vault.write": { carpeta: "notes/gastos", campos: ["monto"] },
    estado: { max_bytes: 1024 },
  };

  test("every declared carpeta is watched, plus the trick's own data folder for estado", () => {
    expect(scopeFolders(caps, "g").sort()).toEqual([".claude/tricks/g/data", "notes/gastos"]);
  });

  test("a trick with no capabilities watches nothing", () => {
    expect(scopeFolders({}, "g")).toEqual([]);
    expect(scopeFolders(undefined, "g")).toEqual([]);
  });

  test("estado alone still watches the trick's own data folder, where estado.json lives", () => {
    expect(scopeFolders({ estado: {} }, "gastos")).toEqual([".claude/tricks/gastos/data"]);
  });

  test("a folder name that is a prefix of a sibling is not a parent of it", () => {
    const notes = [
      { path: "notes/gastos/a.md", mtime: 1 },
      { path: "notes/gastosviejos/b.md", mtime: 1 },
      { path: "otro/c.md", mtime: 1 },
    ];
    expect([...snapshotScope(notes, ["notes/gastos"]).keys()]).toEqual(["notes/gastos/a.md"]);
  });

  test("a touched mtime, a new file and a deleted file are all changes", () => {
    const before = new Map([
      ["a.md", 1],
      ["b.md", 1],
    ]);
    const after = new Map([
      ["a.md", 2],
      ["c.md", 1],
    ]);
    expect(diffScope(before, after)).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("an unchanged scope produces no event at all", () => {
    const snap = new Map([["a.md", 1]]);
    expect(diffScope(snap, new Map(snap))).toEqual([]);
  });

  test("a bulk import does not put ten thousand paths through postMessage", () => {
    const after = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) after.set(`n${i}.md`, 1);
    expect(diffScope(new Map(), after).length).toBe(200);
  });
});
