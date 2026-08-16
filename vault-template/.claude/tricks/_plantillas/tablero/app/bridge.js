/* The app's only route to the vault. Copy this file as-is; it is
 * identical in every starter and there is nothing in it to tune.
 *
 * How it works, in three sentences. The panel mounts this app in a
 * sandboxed frame with no network and no storage, then posts one hello
 * message carrying a MessagePort. Every request and every response after
 * that travels on that port. The port *is* the app's identity — the host
 * knows which trick is calling because of which port the message arrived
 * on, so there is no token to keep and nothing a message body can claim.
 *
 * It also applies the host's theme automatically. The hello (and every
 * `tema` event after it) carries `tema` ("claro"/"oscuro") and `tokens` —
 * the panel's own CSS custom properties (bg, fg, accent, …), read live off
 * `panel/web/src/styles.css`'s `:root`, whatever palette is actually
 * running. This file writes them onto this document's own `:root` as
 * `--host-<name>` (kebab-case: `tokens.bgRaised` → `--host-bg-raised`), and
 * sets `data-tema` to match. Your own CSS never reads `--host-*` directly —
 * define your own variable names and point them at `var(--host-x, fallback)`
 * once, at the top of style.css; see any starter's style.css for the
 * pattern, or `.claude/skills/trick-creator/SKILL.md` §6 for it written up.
 * This is read-only context, not a capability: it costs nothing to ignore,
 * and every trick gets it whether or not it declares any `capacidades`.
 *
 * Protocol: panel/docs/tricks-spec.md §6.
 */
window.Bridge = (function () {
  var pending = new Map(); // id -> { resolve, reject, timer }
  var waiting = []; // ready() callbacks registered before the hello
  var listeners = []; // on() callbacks for unsolicited events
  var port = null;
  var hello = null;
  var seq = 0;

  function kebab(name) {
    return name.replace(/[A-Z]/g, function (c) {
      return "-" + c.toLowerCase();
    });
  }

  /** Applies `tema`/`tokens` from the hello or a `tema` event. Idempotent
   * and safe to call with either shape — a hello has `tema`, a `tema`
   * event has `valor`, and both may carry `tokens`. */
  function aplicarContexto(msg) {
    var tema = msg.tema || msg.valor;
    if (tema) document.documentElement.setAttribute("data-tema", tema);
    var tokens = msg.tokens;
    if (tokens) {
      for (var k in tokens) {
        if (!Object.prototype.hasOwnProperty.call(tokens, k)) continue;
        var v = tokens[k];
        if (v) document.documentElement.style.setProperty("--host-" + kebab(k), v);
      }
    }
  }

  addEventListener("message", function (ev) {
    // The host is the parent window. A sibling frame posting in here is
    // not the host, and its message carries no port worth taking.
    if (ev.source !== window.parent) return;
    if (!ev.data || ev.data.raymond !== "trick-bridge") return;
    // One port per mount. A second hello means something is wrong; the
    // first port is the one the host bound this trick's capabilities to.
    if (port) return;
    if (!ev.ports || !ev.ports[0]) return;

    port = ev.ports[0];
    hello = ev.data;
    aplicarContexto(hello);
    port.onmessage = receive;
    port.start && port.start();
    waiting.splice(0).forEach(function (fn) {
      fn(hello);
    });
  });

  function receive(e) {
    var m = e.data;
    if (!m || m.v !== 1) return;
    if (m.ev) {
      if (m.ev === "tema") aplicarContexto(m);
      listeners.forEach(function (fn) {
        fn(m);
      });
      return;
    }
    var p = pending.get(m.id);
    if (!p) return; // a late answer to a request we already gave up on
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) {
      p.resolve(m.result);
      return;
    }
    var err = new Error((m.error && m.error.message) || "the panel refused this call");
    err.code = (m.error && m.error.code) || "internal";
    p.reject(err);
  }

  function call(op, params) {
    return new Promise(function (resolve, reject) {
      if (!port) {
        reject(fail("no_bridge", "the bridge is not connected yet"));
        return;
      }
      var id = "r" + ++seq;
      // The host expires its own pending entries at 15s; time out with
      // it so a wedged call rejects instead of hanging a spinner forever.
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(fail("timeout", "the panel did not answer " + op));
      }, 15000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      port.postMessage({ v: 1, id: id, op: op, params: params || {} });
    });
  }

  function fail(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  return {
    /** fn(hello) once the port arrives, or immediately if it already has. */
    ready: function (fn) {
      if (hello) fn(hello);
      else waiting.push(fn);
    },
    /** fn(event) for every unsolicited host event: datos.cambiaron, tema. */
    on: function (fn) {
      listeners.push(fn);
    },
    /** Did the manifest declare this capability? Takes a manifest key. */
    can: function (name) {
      return !!hello && Array.isArray(hello.capacidades) && hello.capacidades.indexOf(name) !== -1;
    },
    call: call,
  };
})();
