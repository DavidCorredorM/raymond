/* Checklist — the app. bridge.js is loaded first and provides `Bridge`.
 *
 * What this starter is for: reading a folder of notes and writing one
 * frontmatter field back. Everything else here is the boring part of
 * doing that honestly — an empty state, a visible error, and a re-render
 * when something else changes the same files.
 */
(function () {
  var HECHO = "hecho";
  var ACTIVO = "activo";

  var elResumen = document.getElementById("resumen");
  var elError = document.getElementById("error");
  var elItems = document.getElementById("items");
  var elVacio = document.getElementById("vacio");
  var btnHechos = document.getElementById("mostrar-hechos");

  var items = [];
  var mostrarHechos = false;

  Bridge.ready(function (hello) {
    aplicarTema(hello.tema);
    cargar();
  });

  Bridge.on(function (ev) {
    // A scheduled job, another device, or the user in their editor can
    // change these files while the app is open. Re-read rather than
    // trusting what is on screen — README rule 4 means "nobody was
    // watching" is a normal state, not an edge case.
    if (ev.ev === "datos.cambiaron") cargar();
    if (ev.ev === "tema") aplicarTema(ev.valor);
  });

  btnHechos.addEventListener("click", function () {
    mostrarHechos = !mostrarHechos;
    btnHechos.textContent = mostrarHechos ? "Hide done" : "Show done";
    pintar();
  });

  function cargar() {
    Bridge.call("vault.query", { limite: 200 })
      .then(function (res) {
        items = (res && res.notes) || [];
        mostrarError(null);
        pintar();
      })
      .catch(mostrarError);
  }

  function pintar() {
    var visibles = items.filter(function (n) {
      return mostrarHechos || estado(n) !== HECHO;
    });
    visibles.sort(function (a, b) {
      return etiqueta(a).localeCompare(etiqueta(b));
    });

    elItems.textContent = "";
    visibles.forEach(function (n) {
      elItems.appendChild(fila(n));
    });

    var hechos = items.filter(function (n) {
      return estado(n) === HECHO;
    }).length;
    elResumen.textContent = items.length
      ? items.length - hechos + " open, " + hechos + " done"
      : "";
    elVacio.hidden = items.length > 0;
  }

  function fila(n) {
    var li = document.createElement("li");
    var hecho = estado(n) === HECHO;
    if (hecho) li.className = "hecho";

    var caja = document.createElement("input");
    caja.type = "checkbox";
    caja.checked = hecho;
    caja.id = "c-" + n.path;

    var texto = document.createElement("label");
    texto.className = "texto";
    texto.htmlFor = caja.id;
    // textContent, never innerHTML. A note's title is content the user
    // typed; it is not markup and must never be parsed as any.
    texto.textContent = etiqueta(n);

    var fecha = document.createElement("span");
    fecha.className = "fecha";
    fecha.textContent = campo(n, "actualizado") || "";

    caja.addEventListener("change", function () {
      marcar(li, n, caja.checked ? HECHO : ACTIVO, caja);
    });

    li.appendChild(caja);
    li.appendChild(texto);
    li.appendChild(fecha);
    return li;
  }

  function marcar(li, n, nuevo, caja) {
    var anterior = estado(n);
    // Optimistic: flip it now, put it back if the write is refused. A
    // checkbox that waits for a round trip feels broken on a phone.
    n.frontmatter = n.frontmatter || {};
    n.frontmatter.estado = nuevo;
    li.classList.toggle("hecho", nuevo === HECHO);
    li.classList.add("guardando");

    Bridge.call("vault.write", {
      path: n.path,
      // Only the fields `campos:` in the manifest allows. Sending one it
      // does not list gets the whole call denied, not partly applied.
      frontmatter: { estado: nuevo, actualizado: hoy() },
    })
      .then(function () {
        li.classList.remove("guardando");
        n.frontmatter.actualizado = hoy();
        mostrarError(null);
        pintar();
      })
      .catch(function (err) {
        n.frontmatter.estado = anterior;
        caja.checked = anterior === HECHO;
        li.classList.remove("guardando");
        li.classList.toggle("hecho", anterior === HECHO);
        mostrarError(err);
      });
  }

  /* The label of one note.
   *
   * assumed: a note summary's own title key. The panel's note index and
   * the dashboard `query` widget's `columns` both call it `title`;
   * tricks-spec.md §7.1's `campos` example writes `titulo`. Reading both
   * costs one `||` and survives whichever it turns out to be. Falling
   * back to the filename means a note with no title still shows as
   * something a person can recognise. */
  function etiqueta(n) {
    return n.title || n.titulo || basename(n.path);
  }

  function campo(n, k) {
    return n.frontmatter ? n.frontmatter[k] : undefined;
  }

  function estado(n) {
    return campo(n, "estado") || ACTIVO;
  }

  function basename(p) {
    return String(p || "")
      .split("/")
      .pop()
      .replace(/\.md$/, "");
  }

  function hoy() {
    // Local date, not toISOString(), which is UTC and writes tomorrow's
    // date into a note every evening east of Greenwich.
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + dd;
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
