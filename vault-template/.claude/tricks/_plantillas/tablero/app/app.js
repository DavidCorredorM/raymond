/* Notes at a glance — a read-only view with a hand-drawn chart.
 *
 * Two things this starter is here to show:
 *   1. a chart with no charting library, because the frame has no
 *      network and nothing can be loaded from a CDN;
 *   2. feature detection — the app asks the hello message what it was
 *      granted and only draws the parts it can actually fill.
 */
(function () {
  // The frontmatter field to count by. `tipo` is what the shipped vault
  // template uses; change it to whatever this vault's notes carry.
  var AGRUPAR_POR = "tipo";
  var SIN_VALOR = "(not set)";

  var NS = "http://www.w3.org/2000/svg";
  var elTotal = document.getElementById("total");
  var elFrescura = document.getElementById("frescura");
  var elError = document.getElementById("error");
  var elVacio = document.getElementById("vacio");
  var svg = document.getElementById("grafica");
  var cuerpoTabla = document.querySelector("#tabla tbody");

  var ultimas = []; // last counted rows, kept so a resize can redraw

  Bridge.ready(function (hello) {
    aplicarTema(hello.tema);
    cargar();
    if (Bridge.can("trabajo.estado")) frescura();
  });

  // The frame is as wide as the panel's column, which is one width on a
  // laptop and another on a phone. Redrawing on resize costs four lines
  // and is why the chart's labels are legible at both.
  addEventListener("resize", function () {
    pintar(ultimas);
  });

  Bridge.on(function (ev) {
    if (ev.ev === "datos.cambiaron") cargar();
    if (ev.ev === "tema") aplicarTema(ev.valor);
  });

  function cargar() {
    Bridge.call("vault.query", { limite: 500 })
      .then(function (res) {
        var notes = (res && res.notes) || [];
        elTotal.textContent = notes.length + (notes.length === 1 ? " note" : " notes");
        pintar(contar(notes));
        mostrarError(null);
      })
      .catch(mostrarError);
  }

  function frescura() {
    Bridge.call("trabajo.estado", {})
      .then(function (r) {
        if (!r) return;
        var estado = r.enabled === false ? " (paused)" : "";
        elFrescura.textContent =
          "last run " + (r.timestamp || "?") + ", exit " + r.exitCode + estado;
      })
      .catch(function () {
        // A missing or unreadable job note is not this view's problem to
        // shout about — the counts above are still true. Say nothing.
        elFrescura.textContent = "";
      });
  }

  function contar(notes) {
    var mapa = new Map();
    notes.forEach(function (n) {
      var v = n.frontmatter ? n.frontmatter[AGRUPAR_POR] : undefined;
      var clave = v === undefined || v === null || v === "" ? SIN_VALOR : String(v);
      mapa.set(clave, (mapa.get(clave) || 0) + 1);
    });
    return Array.from(mapa, function (par) {
      return { clave: par[0], n: par[1] };
    }).sort(function (a, b) {
      return b.n - a.n || a.clave.localeCompare(b.clave);
    });
  }

  function pintar(filas) {
    ultimas = filas;
    svg.textContent = "";
    cuerpoTabla.textContent = "";
    elVacio.hidden = filas.length > 0;
    if (!filas.length) {
      svg.removeAttribute("viewBox");
      svg.style.height = "0";
      return;
    }

    // One SVG user unit = one CSS pixel, by setting the viewBox to the
    // frame's own width. The tempting alternative — a fixed viewBox and
    // width:100% — scales the *text* along with the drawing, so labels
    // come out 7px on a phone and 24px on a laptop.
    var ANCHO = Math.max(260, document.documentElement.clientWidth - 28);
    var ALTO_FILA = 26;
    var X_BARRA = Math.min(160, Math.round(ANCHO * 0.34));
    var X_FIN = ANCHO - 26;
    var alto = filas.length * ALTO_FILA + 6;
    svg.setAttribute("viewBox", "0 0 " + ANCHO + " " + alto);
    svg.style.height = alto + "px";
    svg.setAttribute("aria-label", "Notes per " + AGRUPAR_POR);

    var max = filas.reduce(function (m, f) {
      return Math.max(m, f.n);
    }, 0);

    filas.forEach(function (f, i) {
      var y = i * ALTO_FILA + 4;
      var ancho = Math.max(2, Math.round(((X_FIN - X_BARRA) * f.n) / max));

      svg.appendChild(
        crear("text", { x: X_BARRA - 8, y: y + 14, "text-anchor": "end", class: "etiqueta" }, recortar(f.clave, Math.floor(X_BARRA / 7))),
      );
      svg.appendChild(crear("rect", { x: X_BARRA, y: y + 3, width: ancho, height: 14, rx: 3, class: "barra" }));
      svg.appendChild(crear("text", { x: X_BARRA + ancho + 6, y: y + 14, class: "valor" }, String(f.n)));

      var tr = document.createElement("tr");
      var td1 = document.createElement("td");
      td1.textContent = f.clave;
      var td2 = document.createElement("td");
      td2.textContent = String(f.n);
      tr.appendChild(td1);
      tr.appendChild(td2);
      cuerpoTabla.appendChild(tr);
    });
  }

  function crear(tag, attrs, texto) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function recortar(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
