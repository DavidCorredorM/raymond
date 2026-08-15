/* Run and report — a button over `correr_script`, plus `estado`.
 *
 * Two capabilities, and the difference between them is worth noticing.
 * `script.run` reaches all the way out to a process on the machine, so
 * the app is only allowed to name an index. `estado` is the app's own
 * scratch file — one JSON file in this trick's data folder that a person
 * can open and git can diff, because a sandboxed frame has no
 * localStorage to hide state in.
 */
(function () {
  var INDICE = 0; // must be listed in `script.run.acciones` in trick.yaml

  var btn = document.getElementById("correr");
  var elUltima = document.getElementById("ultima");
  var elError = document.getElementById("error");
  var elSalida = document.getElementById("salida");
  var elNota = document.getElementById("nota-salida");

  Bridge.ready(function (hello) {
    aplicarTema(hello.tema);
    if (!Bridge.can("script.run")) {
      btn.disabled = true;
      mostrarError({
        code: "capability_denied",
        message: "this trick's manifest does not declare script.run, so the button cannot do anything",
      });
      return;
    }
    if (Bridge.can("estado")) recordar();
  });

  Bridge.on(function (ev) {
    if (ev.ev === "tema") aplicarTema(ev.valor);
  });

  btn.addEventListener("click", function () {
    btn.disabled = true;
    elNota.hidden = true;
    mostrarError(null);
    elSalida.hidden = false;
    elSalida.textContent = "running…";

    Bridge.call("script.run", { indice: INDICE })
      .then(function (r) {
        r = r || {};
        var texto = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
        elSalida.textContent = texto || "(the script printed nothing)";
        elNota.hidden = false;
        elNota.textContent = r.timedOut
          ? "timed out and was killed — a button gets a few seconds; longer work belongs in a scheduled job"
          : "exit code " + r.exitCode;
        guardar({ cuando: ahora(), exitCode: r.exitCode, timedOut: !!r.timedOut });
      })
      .catch(function (err) {
        elSalida.hidden = true;
        mostrarError(err);
      })
      .then(function () {
        btn.disabled = false;
      });
  });

  /* --- estado: the app's own persistence ------------------------------ */

  function recordar() {
    Bridge.call("estado.get", {})
      .then(function (res) {
        var v = valorDe(res);
        if (v && v.cuando) {
          elUltima.textContent = "last run " + v.cuando + ", exit " + v.exitCode;
        }
      })
      .catch(function () {
        // No state yet is the normal first-run case, not an error worth
        // showing anyone.
      });
  }

  function guardar(v) {
    if (!Bridge.can("estado")) return;
    elUltima.textContent = "last run " + v.cuando + ", exit " + v.exitCode;
    Bridge.call("estado.set", { valor: v }).catch(mostrarError);
  }

  /* assumed: `estado.get` answers with the stored value. Whether it
   * arrives bare or wrapped as `{ valor }` is not pinned down in
   * tricks-spec.md §7.4; `estado.set` takes `params.valor`, so both
   * readings are plausible. One line covers either. */
  function valorDe(res) {
    if (res && typeof res === "object" && "valor" in res) return res.valor;
    return res;
  }

  /* --- small stuff ----------------------------------------------------- */

  function ahora() {
    var d = new Date();
    var p = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes())
    );
  }

  function aplicarTema(tema) {
    if (tema) document.documentElement.setAttribute("data-tema", tema);
  }

  function mostrarError(err) {
    if (!err) {
      elError.hidden = true;
      return;
    }
    elError.hidden = false;
    elError.textContent =
      err.code === "capability_denied"
        ? "This trick's manifest does not allow that: " + err.message
        : err.message;
  }
})();
