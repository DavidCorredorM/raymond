/**
 * The trick bridge protocol, host side — everything about it that is a
 * decision rather than a DOM call (spec §6).
 *
 * Split out of `TrickHost.tsx` on purpose. The host is the piece holding
 * the capability port, and the parts of it worth attacking are pure
 * functions of a message: is this envelope well-formed, does this op need
 * a capability this trick declared, is this frame over its rate limit.
 * Those are testable without a browser; the component around them is
 * mostly `addEventListener`.
 *
 * The one rule that shapes the whole file: **the host authenticates a
 * message by the port it arrived on, never by anything in the message.**
 * There is no trick name in a request here and nothing reads
 * `event.origin` — an opaque-origin document reports the literal string
 * `"null"`, which every such document reports, so it identifies nothing
 * (§6.3). The trick's identity is a closure variable in the host and a
 * path segment on the wire.
 */

/** The complete capability vocabulary (spec §7), mirrored from `server/src/tricks.ts`. */
export const CAPABILITY_KEYS = [
  "vault.query",
  "vault.read",
  "vault.write",
  "estado",
  "script.run",
  "trabajo.estado",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/**
 * Every op, and the manifest key that grants it. `estado` is one key
 * granting two ops — a store you can write but not read is not a store.
 * Identical to `OP_CAPABILITY` in `server/src/bridge.ts`, and it has to
 * stay identical: this is the fast, precise first line, and the server
 * re-derives the same answer from its own fresh read of `trick.yaml`
 * (§6.7). A disagreement here shows up as the host allowing something the
 * server then refuses, which is the harmless direction, but it is still a
 * bug.
 */
export const OP_CAPABILITY: Record<string, CapabilityKey> = {
  "vault.query": "vault.query",
  "vault.read": "vault.read",
  "vault.write": "vault.write",
  "estado.get": "estado",
  "estado.set": "estado",
  "script.run": "script.run",
  "trabajo.estado": "trabajo.estado",
};

export type BridgeCode =
  | "capability_denied"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "unsupported_op"
  | "internal";

/** Spec §6.6. Ceilings against accident and spin, not against a determined attacker in the tab. */
export const LIMITS = {
  /** In-flight requests per mounted frame. */
  inFlight: 32,
  /** Ops per second, token bucket. */
  ratePerSecond: 20,
  /** Burst size for the same bucket. */
  burst: 40,
  /** Per message, either direction. */
  maxMessageBytes: 256 * 1024,
  /** A pending request the server never answers is expired, so the map cannot grow. */
  pendingMs: 15_000,
} as const;

export interface TrickRequest {
  /** Opaque, chosen by the frame, echoed verbatim. Never parsed, never an object key. */
  id: string | number;
  op: string;
  params: Record<string, unknown>;
}

export type ParsedFrameMessage =
  | { ok: true; request: TrickRequest }
  | { ok: false; drop: string };

/**
 * §6.4, exactly: a message with a missing or unknown `v`, a missing `id`,
 * or a non-string `op` is **dropped with a log line, not answered**. An
 * answer to a malformed message is a probing oracle for a frame that can
 * send thousands of them, which is why this returns "drop" rather than an
 * error envelope — every other refusal in this file does get answered.
 *
 * `id` is restricted to a string or a number, and the host stores pending
 * state in a `Map`. Both matter: `__proto__` as an `id` on a plain object
 * is free prototype pollution, and an object `id` would smuggle structure
 * into something the host echoes back.
 */
export function parseFrameMessage(data: unknown): ParsedFrameMessage {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, drop: "not an object" };
  }
  const msg = data as Record<string, unknown>;
  if (msg.v !== 1) return { ok: false, drop: "missing or unknown protocol version v" };
  if (typeof msg.id !== "string" && typeof msg.id !== "number") {
    return { ok: false, drop: "id must be a string or number" };
  }
  if (typeof msg.op !== "string" || msg.op === "") {
    return { ok: false, drop: "op must be a non-empty string" };
  }
  const params = msg.params ?? {};
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return { ok: false, drop: "params must be an object" };
  }
  return {
    ok: true,
    request: { id: msg.id, op: msg.op, params: params as Record<string, unknown> },
  };
}

/**
 * The manifest key an op needs, or `null` if the op is not in the
 * vocabulary at all. `null` is `unsupported_op`, not `capability_denied`
 * — the difference is "this panel doesn't do that" versus "your manifest
 * doesn't allow that", and telling an author the wrong one sends them
 * hunting a manifest bug that is not there (§6.5).
 */
export function opCapability(op: string): CapabilityKey | null {
  return Object.prototype.hasOwnProperty.call(OP_CAPABILITY, op) ? OP_CAPABILITY[op] : null;
}

/**
 * The host's first-line check. `declared` is the set of **manifest keys**
 * the server said this trick has — read from `GET /api/tricks/:name`, not
 * from anything the frame said.
 *
 * This is a courier's check, not the authority's: the server re-derives
 * the same decision from disk on every request and will refuse an
 * out-of-scope call the host wrongly forwarded (§6.7). Its job here is to
 * give the author a fast, precise error and to keep an obviously-denied
 * op from costing a round trip.
 */
export function denyReason(
  trick: string,
  op: string,
  declared: ReadonlySet<string>,
): { code: BridgeCode; message: string } | null {
  const cap = opCapability(op);
  if (!cap) return { code: "unsupported_op", message: `no such op: ${op}` };
  if (!declared.has(cap)) {
    return { code: "capability_denied", message: `${trick} did not declare ${cap}` };
  }
  return null;
}

/** UTF-8 byte length, which is what a size limit means. `.length` is code units. */
const encoder = new TextEncoder();
export function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/**
 * §6.6's 20 ops/s, burst 40. The server keeps an identical bucket per
 * trick (`bridge.ts`) because a `curl` caller has no host in front of it;
 * this one exists so a spinning app gets a local, immediate
 * `too_many_requests` instead of 40 HTTP round trips a second.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rate = LIMITS.ratePerSecond,
    private readonly burst = LIMITS.burst,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/**
 * Which vault folders this trick's data lives in, from its resolved
 * capabilities — the scope the freshness poll watches (§8).
 *
 * `estado` adds the trick's own data folder even though it names no
 * `carpeta`: `estado.json` lives there, and an agent editing it by hand
 * is exactly the "it changed while nobody was looking" case the event
 * exists for.
 */
export function scopeFolders(
  capacidades: Record<string, unknown> | undefined,
  trickName: string,
): string[] {
  const out = new Set<string>();
  for (const key of ["vault.query", "vault.read", "vault.write"]) {
    const cap = capacidades?.[key];
    const carpeta = (cap as { carpeta?: unknown } | undefined)?.carpeta;
    if (typeof carpeta === "string" && carpeta) out.add(carpeta);
  }
  if (capacidades && "estado" in capacidades) {
    out.add(`.claude/tricks/${trickName}/data`);
  }
  return [...out];
}

export interface ScopedNote {
  path: string;
  mtime: number;
}

/** A path/mtime snapshot of everything in scope. The whole state the poll compares. */
export function snapshotScope(
  notes: readonly ScopedNote[],
  folders: readonly string[],
): Map<string, number> {
  const snap = new Map<string, number>();
  if (!folders.length) return snap;
  for (const note of notes) {
    for (const folder of folders) {
      if (note.path === folder || note.path.startsWith(`${folder}/`)) {
        snap.set(note.path, note.mtime);
        break;
      }
    }
  }
  return snap;
}

/**
 * Added, removed or touched paths between two snapshots. Sorted so the
 * event body is stable, and capped so one bulk import does not put a
 * 10,000-entry array through `postMessage`.
 */
export function diffScope(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  cap = 200,
): string[] {
  const changed: string[] = [];
  for (const [path, mtime] of after) {
    if (before.get(path) !== mtime) changed.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changed.push(path);
  }
  changed.sort();
  return changed.length > cap ? changed.slice(0, cap) : changed;
}

/** The §6.4 response envelope, built in one place so `v` and `id` can never drift. */
export function okEnvelope(id: string | number, result: unknown) {
  return { v: 1 as const, id, ok: true as const, result };
}

export function errorEnvelope(id: string | number, code: BridgeCode, message: string) {
  return { v: 1 as const, id, ok: false as const, error: { code, message } };
}

/**
 * Turn whatever the bridge route answered into an envelope this frame can
 * trust: our `v`, our `id`, and a shape that is either `ok` with a result
 * or `ok: false` with a code from the table.
 *
 * The host reads the body on a non-2xx deliberately (§6.8): the status is
 * there so an access log does not read `200 OK` for a refused write, and
 * the `code` in the body is the contract. A body that is not an envelope
 * at all — Fastify's own 413 or 415, a proxy's HTML error page — becomes
 * `internal`, because the frame is owed exactly one well-formed answer
 * per well-formed request and "the server said something I don't
 * understand" is an internal failure, not a caller error.
 */
export function envelopeFromServer(id: string | number, status: number, body: unknown) {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (b.ok === true) return okEnvelope(id, b.result);
  const err = (typeof b.error === "object" && b.error !== null ? b.error : {}) as Record<
    string,
    unknown
  >;
  const code = typeof err.code === "string" ? (err.code as BridgeCode) : null;
  if (code && code in STATUS_OF) {
    return errorEnvelope(id, code, typeof err.message === "string" ? err.message : code);
  }
  return errorEnvelope(id, "internal", `the panel's bridge answered ${status} with no error code`);
}

/** Only used to recognise a code the server sent; the status mapping itself is the server's. */
const STATUS_OF: Record<BridgeCode, number> = {
  capability_denied: 403,
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  unsupported_op: 501,
  internal: 500,
};
