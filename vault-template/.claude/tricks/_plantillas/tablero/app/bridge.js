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
 * Protocol: panel/docs/tricks-spec.md §6.
 */
window.Bridge = (function () {
  var pending = new Map(); // id -> { resolve, reject, timer }
  var waiting = []; // ready() callbacks registered before the hello
  var listeners = []; // on() callbacks for unsolicited events
  var port = null;
  var hello = null;
  var seq = 0;

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
