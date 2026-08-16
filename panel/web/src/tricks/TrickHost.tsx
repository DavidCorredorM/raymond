import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/store";
import { interpolate } from "../i18n/interpolate";
import {
  byteLength,
  denyReason,
  diffScope,
  envelopeFromServer,
  errorEnvelope,
  LIMITS,
  parseFrameMessage,
  scopeFolders,
  snapshotScope,
  TokenBucket,
  type BridgeCode,
} from "./protocol";

/**
 * The host: the panel side of a mounted trick (spec §6, seam 2).
 *
 * It does four things, and the first is the reason the other three are
 * written the way they are.
 *
 * **1. It mounts the app into an opaque origin and hands it exactly one
 * capability port.** `sandbox="allow-scripts"` and never
 * `allow-same-origin` — a frame with both can reach
 * `window.frameElement`, strip its own sandbox attribute and reload
 * unsandboxed on the panel's origin (§5.1). The port is transferred on
 * the **first** `load` event only. A sandboxed frame may navigate itself,
 * and a naive host that re-handshakes on every `load` hands a fresh
 * capability port to a document it never mounted (measured, §10.7). The
 * second `load` therefore unmounts the frame instead.
 *
 * **2. It authenticates by port, not by origin.** `event.origin` for
 * anything this frame sends is the literal string `"null"`, which every
 * opaque-origin document in the browser reports, so it authenticates
 * nothing. Nothing in this file reads it. The trick's name is a closure
 * variable here and a path segment on the wire, and any `trick` field in
 * a message body is ignored — there is no code path that reads one.
 *
 * **3. It is the courier for a call the frame cannot make itself.** The
 * app's CSP is `connect-src 'none'`, and the server's cross-site guard
 * refuses a request from an opaque origin anyway, so
 * `POST /api/tricks/:name/bridge` is issued from here, on the panel's
 * real origin. That is the design and not a workaround: it is what makes
 * the trick's only route to the vault a port the panel controls.
 *
 * **4. It shows the author what was refused.** `capability_denied` next
 * to the trick, in the panel's own chrome, outside the iframe — a trick
 * asking for something it never declared is worth a human noticing, and
 * an under-declared manifest that fails loudly is the intended
 * development loop (§6.5, §12.5).
 *
 * The host is a courier, not the authority: the server re-derives every
 * decision from its own fresh read of `trick.yaml` (§6.7). Everything
 * checked here is checked again there, and the checks here exist for
 * speed and for legible errors, never as the fence.
 */

/** What the app is told at handshake. The only `window`-level message in the protocol (§6.2). */
interface Hello {
  raymond: "trick-bridge";
  v: 1;
  trick: string;
  capacidades: string[];
  tema: "claro" | "oscuro";
  locale: string;
}

/** One refusal, shown to the user next to the trick. */
interface Problem {
  key: number;
  at: number;
  op: string;
  code: BridgeCode | "dropped";
  message: string;
}

type Phase = "loading" | "live" | "no-bridge" | "navigated-away";

/** Poll interval for `datos.cambiaron` (§8). Paused while the document is hidden. */
const FRESHNESS_MS = 5_000;
const MAX_PROBLEMS = 20;

function currentTheme(): "claro" | "oscuro" {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "oscuro"
    : "claro";
}

export interface TrickHostProps {
  name: string;
  titulo: string;
  /** Frame height in CSS px, from the manifest's `app.alto` (server-defaulted). */
  alto: number;
  /**
   * The manifest's resolved `capacidades` map, straight from
   * `GET /api/tricks/:name`. Keys are manifest keys; the values carry the
   * `carpeta` the freshness poll watches. **Absent or empty means the app
   * gets no bridge at all** (§4.1) — a perfectly good state for a purely
   * visual trick, and this component honours it literally: no port is
   * transferred, so there is no channel to deny things on.
   */
  capacidades: Record<string, unknown>;
}

export function TrickHost({ name, titulo, alto, capacidades }: TrickHostProps) {
  // Chrome-only addition (language-setting pass): the JSX below reads `t`
  // for its user-visible strings. Nothing in the effect/protocol logic
  // beneath this reads it — that code stays untouched on purpose (see the
  // language-setting agent's report for why: a security fix was in flight
  // on this same file's internals).
  const t = useT();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [problems, setProblems] = useState<Problem[]>([]);

  // Object identity from a refetch must not remount the frame, so the
  // effect below depends on the *content* of these, not the objects.
  const capKeys = useMemo(() => Object.keys(capacidades ?? {}).sort(), [capacidades]);
  const capKeysSignature = capKeys.join(",");
  const folders = useMemo(
    () => scopeFolders(capacidades, name).sort(),
    [capacidades, name],
  );
  const foldersSignature = folders.join(",");

  const report = useCallback((op: string, code: Problem["code"], message: string) => {
    setProblems((prev) =>
      [...prev, { key: Date.now() + Math.random(), at: Date.now(), op, code, message }].slice(
        -MAX_PROBLEMS,
      ),
    );
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const declared = new Set(capKeysSignature ? capKeysSignature.split(",") : []);
    const scope = foldersSignature ? foldersSignature.split(",") : [];

    let loads = 0;
    let disposed = false;
    let port: MessagePort | null = null;
    /** id → the timer that will expire it. A `Map`, never a plain object (§6.4). */
    const pending = new Map<string | number, ReturnType<typeof setTimeout>>();
    const bucket = new TokenBucket();
    const controller = new AbortController();
    /**
     * A trick that spins the bridge produces one refusal per message, and
     * eighty rows of "slow down" would push the `capability_denied` an
     * author actually needs off the end of the list. Report the first one
     * and count the rest — the fact worth surfacing is "this trick is
     * hammering its limits", which one line says.
     */
    let throttled = 0;
    function reportThrottle(op: string, message: string) {
      throttled += 1;
      if (throttled === 1 || throttled % 25 === 0) {
        report(op, "too_many_requests", `${message} (${throttled} refused so far)`);
      }
    }

    function send(envelope: unknown) {
      if (!port || disposed) return;
      // §6.6 applies in both directions. A `vault.read` of a large file
      // can legitimately come back over this, so the failure has to be an
      // envelope the app can render, not a silently dropped answer.
      let json: string;
      try {
        json = JSON.stringify(envelope);
      } catch {
        return;
      }
      if (byteLength(json) > LIMITS.maxMessageBytes) {
        const id = (envelope as { id?: string | number }).id;
        if (id === undefined) return;
        port.postMessage(
          errorEnvelope(
            id,
            "bad_request",
            `the answer is larger than the ${LIMITS.maxMessageBytes} byte message limit`,
          ),
        );
        report(String((envelope as { op?: string }).op ?? "?"), "bad_request", "answer too large");
        return;
      }
      port.postMessage(envelope);
    }

    function settle(id: string | number, envelope: unknown, op: string) {
      const timer = pending.get(id);
      if (timer === undefined) return; // already expired; the frame got its one answer
      clearTimeout(timer);
      pending.delete(id);
      const e = envelope as { ok?: boolean; error?: { code?: BridgeCode; message?: string } };
      if (e.ok === false && e.error) {
        report(op, e.error.code ?? "internal", e.error.message ?? "");
      }
      send(envelope);
    }

    async function onPortMessage(ev: MessageEvent) {
      // Deliberately nothing here reads `ev.origin` or any `trick` field
      // in `ev.data`. The port is the identity (§6.3).
      const parsed = parseFrameMessage(ev.data);
      if (!parsed.ok) {
        // Dropped, not answered: an answer to a malformed message is a
        // probing oracle. Logged so it is not invisible, and surfaced,
        // because in practice this is an author's own bug.
        console.warn(`[trick ${name}] dropped a malformed bridge message: ${parsed.drop}`);
        report("(malformed)", "dropped", parsed.drop);
        return;
      }
      const { id, op, params } = parsed.request;

      if (pending.has(id)) {
        send(errorEnvelope(id, "bad_request", `id ${String(id)} is already in flight`));
        return;
      }

      let body: string;
      try {
        body = JSON.stringify({ v: 1, id, op, params });
      } catch {
        send(errorEnvelope(id, "bad_request", "params are not serializable as JSON"));
        return;
      }
      if (byteLength(body) > LIMITS.maxMessageBytes) {
        send(
          errorEnvelope(
            id,
            "bad_request",
            `message is larger than the ${LIMITS.maxMessageBytes} byte limit`,
          ),
        );
        return;
      }
      if (pending.size >= LIMITS.inFlight) {
        const why = `${LIMITS.inFlight} requests already in flight`;
        reportThrottle(op, why);
        send(errorEnvelope(id, "too_many_requests", why));
        return;
      }
      if (!bucket.take()) {
        const why = `over ${LIMITS.ratePerSecond} ops/second — slow down`;
        reportThrottle(op, why);
        send(errorEnvelope(id, "too_many_requests", why));
        return;
      }

      const denied = denyReason(name, op, declared);
      if (denied) {
        report(op, denied.code, denied.message);
        send(errorEnvelope(id, denied.code, denied.message));
        return;
      }

      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          send(errorEnvelope(id, "internal", `the panel gave up waiting for ${op}`));
          report(op, "internal", "the panel's bridge call did not answer in 15s");
        }, LIMITS.pendingMs),
      );

      try {
        const res = await fetch(`/api/tricks/${encodeURIComponent(name)}/bridge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        // The body is read on a non-2xx too: the status exists so a log
        // does not read 200 for a refused write, but the `code` in the
        // body is the contract (§6.8).
        let parsedBody: unknown = null;
        try {
          parsedBody = await res.json();
        } catch {
          parsedBody = null;
        }
        settle(id, envelopeFromServer(id, res.status, parsedBody), op);
      } catch (err) {
        if (controller.signal.aborted) return;
        settle(id, errorEnvelope(id, "internal", `the panel could not reach its own API`), op);
        console.warn(`[trick ${name}] bridge call failed`, err);
      }
    }

    function onLoad() {
      loads += 1;
      if (loads > 1) {
        // §6.2 step 3. The frame navigated itself. It does not get a
        // second port — not because the second document would escalate
        // (its calls would still be evaluated against *this* trick's
        // declarations), but because "this port belongs to the app I
        // loaded" is the invariant the whole capability binding rests on,
        // and an invariant that is broken but currently harmless is how
        // the §2.3 bug happens.
        console.warn(`[trick ${name}] second load event — the frame navigated itself; unmounting`);
        teardownPort();
        setPhase("navigated-away");
        return;
      }

      if (!declared.size) {
        // "Absent or empty means the app gets no bridge at all" (§4.1).
        // No channel is created, so there is no port in existence to
        // reach the vault with — not a port that denies everything.
        setPhase("no-bridge");
        return;
      }

      const channel = new MessageChannel();
      port = channel.port1;
      channel.port1.onmessage = onPortMessage;
      channel.port1.start();

      const hello: Hello = {
        raymond: "trick-bridge",
        v: 1,
        trick: name,
        capacidades: [...declared],
        tema: currentTheme(),
        locale: navigator.language || "en",
      };
      // `targetOrigin` must be `"*"`: an opaque origin has no name and
      // `postMessage(msg, "null")` throws. Three things make that safe
      // together — the host owns this `contentWindow` reference, the
      // panel's `frame-src 'self'` means the frame can only ever be a
      // panel-origin document, and a second `load` never gets a port.
      frame?.contentWindow?.postMessage(hello, "*", [channel.port2]);
      setPhase("live");
    }

    function teardownPort() {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      controller.abort();
      if (port) {
        port.onmessage = null;
        port.close();
      }
      port = null;
    }

    /**
     * A window-level `message` from the frame carries no ops, ever (§6.3).
     * This listener exists so that fact is observable rather than
     * implicit: it logs and discards. Adding an action here would be the
     * bug — a `window` message is not bound to a port and so is not bound
     * to a trick.
     */
    function onWindowMessage(ev: MessageEvent) {
      if (!frame || ev.source !== frame.contentWindow) return;
      const data = ev.data as { raymond?: unknown; op?: unknown } | null;
      if (data && typeof data === "object" && "op" in data) {
        console.warn(
          `[trick ${name}] ignored a window-level message claiming op ${String(data.op)} ` +
            `(origin ${ev.origin}); only the port carries ops`,
        );
        report(String(data.op), "dropped", "window-level messages carry no ops — use the port");
      }
    }

    frame.addEventListener("load", onLoad);
    window.addEventListener("message", onWindowMessage);

    // ---- freshness (§8) -------------------------------------------------
    // A scheduled job is an actor and the browser is not watching it, so
    // an app must be correct when its data changed while nobody was
    // looking. Polling, because the panel has no push transport; paused
    // while the document is hidden, so a backgrounded tab is not a
    // permanent /api/notes client.
    let snapshot: Map<string, number> | null = null;
    let freshnessTimer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      if (disposed || !port || document.visibilityState === "hidden" || !scope.length) return;
      try {
        // Both lists, not just `/api/notes`. A trick's scope holds notes
        // *and* files: `vault.read` may declare `.json`/`.csv`, and
        // `estado.json` is an attachment as far as the index is
        // concerned. Watching only the notes half means an app whose data
        // is JSON never hears that it changed, which is exactly the case
        // §8 exists for.
        const [notesRes, filesRes] = await Promise.all([
          fetch("/api/notes", { signal: controller.signal }),
          fetch("/api/attachments", { signal: controller.signal }),
        ]);
        if (!notesRes.ok || !filesRes.ok) return;
        const entries = [
          ...((await notesRes.json()) as Array<{ path: string; mtime: number }>),
          ...((await filesRes.json()) as Array<{ path: string; mtime: number }>),
        ];
        const next = snapshotScope(entries, scope);
        if (snapshot) {
          const changed = diffScope(snapshot, next);
          if (changed.length) send({ v: 1, ev: "datos.cambiaron", paths: changed });
        }
        snapshot = next;
      } catch {
        // The panel's own list endpoint being briefly unavailable is not
        // something to tell the trick about; the next tick retries.
      }
    }

    if (scope.length) {
      void poll();
      freshnessTimer = setInterval(() => void poll(), FRESHNESS_MS);
    }

    // ---- theme ----------------------------------------------------------
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onTheme = () => send({ v: 1, ev: "tema", valor: currentTheme() });
    media?.addEventListener("change", onTheme);

    return () => {
      disposed = true;
      frame.removeEventListener("load", onLoad);
      window.removeEventListener("message", onWindowMessage);
      media?.removeEventListener("change", onTheme);
      if (freshnessTimer) clearInterval(freshnessTimer);
      teardownPort();
    };
    // `capKeysSignature`/`foldersSignature` rather than the objects: a
    // 30-second refetch of the same manifest must not remount the frame
    // and mint a new port.
  }, [name, capKeysSignature, foldersSignature, report]);

  const src = `/api/tricks/${encodeURIComponent(name)}/app/`;

  return (
    <div className="trick-host">
      {/* Chrome the trick cannot draw over: the app's rectangle ends at
          the iframe, and the name and "mini app" label live outside it
          (§2.4 — a trick can lie inside its own rectangle, and the
          mitigation is presentation). */}
      <div className="trick-host-chrome">
        <span className="trick-host-label">{t.trickHost.miniAppLabel}</span>
        <span className="muted trick-host-caps">
          {capKeys.length ? capKeys.join(" · ") : t.trickHost.noCapabilitiesNoBridge}
        </span>
      </div>

      {phase === "navigated-away" ? (
        <div className="trick-host-gone">
          <p>{t.trickHost.navigatedAwayTitle}</p>
          <p className="muted">
            {interpolate(t.trickHost.navigatedAwayBodyTemplate, { name: <code>{name}</code> })}
          </p>
        </div>
      ) : (
        <iframe
          ref={frameRef}
          className="trick-host-frame"
          style={{ height: `${alto}px` }}
          /* Exactly this, forever. Adding `allow-same-origin` next to
             `allow-scripts` is not a sandbox: the frame could then reach
             `window.frameElement`, remove this attribute and reload
             itself on the panel's origin. */
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={src}
          title={titulo}
        />
      )}

      {phase === "no-bridge" && (
        <p className="muted trick-host-note">{t.trickHost.noBridgeNote}</p>
      )}

      {problems.length > 0 && (
        <div className="trick-host-problems">
          <div className="trick-host-problems-head">
            <strong>{problems.length}</strong> {t.trickHost.refusedCall(problems.length)}
            <button type="button" className="ligero" onClick={() => setProblems([])}>
              {t.trickHost.clear}
            </button>
          </div>
          <ul>
            {problems.map((p) => (
              <li key={p.key} className={`trick-problem trick-problem-${p.code}`}>
                <code>{p.op}</code> <span className="trick-problem-code">{p.code}</span>
                <span className="muted"> — {p.message}</span>
              </li>
            ))}
          </ul>
          {problems.some((p) => p.code === "capability_denied") && (
            <p className="muted trick-host-note">
              {interpolate(t.trickHost.capabilityDeniedNoteTemplate, {
                capabilityDenied: <code>capability_denied</code>,
                trickYaml: <code>trick.yaml</code>,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
