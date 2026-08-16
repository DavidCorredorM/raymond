/* Vault steward — the review queue. bridge.js is loaded first.
 *
 * One card per finding in `steward/`. Each shows the strange thing, asks
 * what is true, and takes a free-text answer. Answering writes five
 * frontmatter fields back to that finding's own file — nothing else, ever.
 * The next steward run reads them: a rename it can carry out mechanically,
 * an answer about what is true goes to the agent half.
 *
 * The evidence body is fetched with vault.read only when a card is opened.
 * Twenty-five cards read eagerly would be twenty-five ops on mount, and
 * the bridge's ceiling is 20/second.
 */
(function () {
  var ABIERTO = "abierto";

  var elResumen = document.getElementById("resumen");
  var elCorrida = document.getElementById("corrida");
  var elError = document.getElementById("error");
  var elTarjetas = document.getElementById("tarjetas");
  var elVacio = document.getElementById("vacio");
  var btnCerradas = document.getElementById("ver-cerradas");

  var findings = [];
  var verCerradas = false;
  var abiertas = {};   // path -> true, which cards are expanded
  var cuerpos = {};    // path -> evidence text, once read

  Bridge.ready(function (hello) {
    aplicarTema(hello.tema);
    cargar();
    estadoDelTrabajo();
  });

  Bridge.on(function (ev) {
    // The steward runs unattended. "The files changed while nobody was
    // looking" is the normal case here, not an edge case.
    if (ev.ev === "datos.cambiaron") {
      cuerpos = {};
      cargar();
    }
    if (ev.ev === "tema") aplicarTema(ev.valor);
  });

  btnCerradas.addEventListener("click", function () {
    verCerradas = !verCerradas;
    btnCerradas.textContent = verCerradas ? "Hide answered" : "Show answered";
    pintar();
  });

  function cargar() {
    Bridge.call("vault.query", { limite: 200 })
      .then(function (res) {
        findings = ((res && res.notes) || []).filter(function (n) {
          return basename(n.path) !== "index";
        });
        mostrarError(null);
        pintar();
      })
      .catch(mostrarError);
  }

  function estadoDelTrabajo() {
    if (!Bridge.can("trabajo.estado")) return;
    Bridge.call("trabajo.estado", {})
      .then(function (r) {
        if (!r) return;
        var ok = r.exitCode === 0;
        elCorrida.textContent =
          "last run " + (r.timestamp || "?") + (ok ? ", ok" : ", FAILED exit " + r.exitCode);
        elCorrida.className = ok ? "sutil" : "sutil malo";
      })
      .catch(function (err) {
        // Never leave this blank: a blank space where a timestamp belongs
        // reads as "everything is current", which is the one thing it
        // must not say when the feed may be dead.
        elCorrida.textContent =
          err.code === "unsupported_op"
            // The panel implements trabajo.estado in seam 6 of
            // panel/docs/tricks-spec.md §13. Until then this is the
            // honest answer, and it is not the user's problem to fix.
            ? "this panel version can't report the last run yet"
            : "no scheduled run installed — see the vault-steward skill";
      });
  }

  /* ---------------------------------------------------------------- */

  function pintar() {
    var vis = findings.filter(function (n) {
      return verCerradas || estado(n) === ABIERTO;
    });
    vis.sort(function (a, b) {
      return String(a.path).localeCompare(String(b.path));
    });

    elTarjetas.textContent = "";
    vis.forEach(function (n) {
      elTarjetas.appendChild(tarjeta(n));
    });

    var open = findings.filter(function (n) {
      return estado(n) === ABIERTO;
    }).length;
    elResumen.textContent = open
      ? open + (open === 1 ? " thing to look at" : " things to look at")
      : "Nothing open";
    elVacio.hidden = vis.length > 0;
  }

  function tarjeta(n) {
    var art = document.createElement("article");
    art.className = "tarjeta " + (estado(n) === ABIERTO ? "" : "cerrada");

    var cab = document.createElement("div");
    cab.className = "cabecera";

    var clase = document.createElement("span");
    clase.className = "clase " + kindOf(n);
    clase.textContent = etiquetaClase(kindOf(n));
    cab.appendChild(clase);

    if (estado(n) !== ABIERTO) {
      var est = document.createElement("span");
      est.className = "estado";
      est.textContent = estado(n);
      cab.appendChild(est);
    }
    art.appendChild(cab);

    var h = document.createElement("h2");
    // textContent, never innerHTML. A finding's title quotes the user's
    // own filenames and note titles; it is content, not markup.
    h.textContent = titulo(n);
    art.appendChild(h);

    var q = document.createElement("p");
    q.className = "pregunta";
    q.textContent = campo(n, "pregunta") || "What is actually true here?";
    art.appendChild(q);

    var ver = document.createElement("button");
    ver.type = "button";
    ver.className = "ligero";
    ver.textContent = abiertas[n.path] ? "Hide the evidence" : "Show the evidence";
    ver.addEventListener("click", function () {
      abiertas[n.path] = !abiertas[n.path];
      if (abiertas[n.path]) leerCuerpo(n);
      pintar();
    });
    art.appendChild(ver);

    if (abiertas[n.path]) {
      var pre = document.createElement("pre");
      pre.className = "evidencia";
      pre.textContent = cuerpos[n.path] || "Reading…";
      art.appendChild(pre);
    }

    var previa = campo(n, "respuesta");
    var ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "What is true? Say it the way you would say it out loud.";
    ta.value = previa || "";
    art.appendChild(ta);

    var acciones = document.createElement("div");
    acciones.className = "acciones";
    acciones.appendChild(boton("Save", "ligero", function () {
      responder(art, n, ta.value, "", ABIERTO);
    }));
    acciones.appendChild(boton("Apply this", "primario", function () {
      responder(art, n, ta.value, "aplicar", "respondido");
    }));
    acciones.appendChild(boton("Not a problem", "ligero", function () {
      responder(art, n, ta.value, "descartar", "respondido");
    }));
    art.appendChild(acciones);

    var nota = document.createElement("p");
    nota.className = "sutil";
    nota.textContent =
      "“Apply this” records your answer. A rename or move is carried out by the "
      + "next steward run; an answer about what is true is picked up by the "
      + "vault-steward skill. Nothing changes in your notes from this page.";
    art.appendChild(nota);

    return art;
  }

  function boton(texto, clase, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", fn);
    return b;
  }

  function leerCuerpo(n) {
    if (cuerpos[n.path] !== undefined) return;
    if (!Bridge.can("vault.read")) {
      cuerpos[n.path] = "This trick was not granted vault.read, so it cannot show "
        + "the evidence. Open " + n.path + " in the vault instead.";
      return;
    }
    Bridge.call("vault.read", { path: n.path })
      .then(function (res) {
        // assumed: the result shape. tricks-spec.md pins the server's
        // checks for vault.read, not the name of the field it answers
        // with. Reading the three plausible ones costs one expression.
        var txt = typeof res === "string" ? res
          : (res && (res.contenido || res.content || res.texto || res.text)) || "";
        cuerpos[n.path] = sinFrontmatter(txt) || "(empty)";
        pintar();
      })
      .catch(function (err) {
        cuerpos[n.path] = "Could not read it: " + err.message;
        pintar();
      });
  }

  function responder(art, n, texto, decision, nuevoEstado) {
    art.classList.add("guardando");
    var campos = {
      estado: nuevoEstado,
      respuesta: texto,
      decision: decision,
      actualizado: hoy(),
    };
    if (decision) campos.respondido = hoy();

    Bridge.call("vault.write", { path: n.path, frontmatter: campos })
      .then(function () {
        n.frontmatter = n.frontmatter || {};
        for (var k in campos) n.frontmatter[k] = campos[k];
        art.classList.remove("guardando");
        mostrarError(null);
        pintar();
      })
      .catch(function (err) {
        art.classList.remove("guardando");
        mostrarError(err);
      });
  }

  /* ---------------------------------------------------------------- */

  function campo(n, k) {
    return n.frontmatter ? n.frontmatter[k] : undefined;
  }

  function estado(n) {
    return campo(n, "estado") || ABIERTO;
  }

  function kindOf(n) {
    var f = campo(n, "finding");
    return (f && f.kind) || "finding";
  }

  function etiquetaClase(k) {
    var m = {
      "broken-link": "broken link",
      "duplicate-basename": "duplicate name",
      filename: "filename",
      "folder-shape": "folder shape",
      orphan: "orphan",
      misplaced: "misplaced",
      contradiction: "contradiction",
      stale: "possibly stale",
    };
    return m[k] || k;
  }

  /* assumed: a note summary's title key — the panel's Note type and the
   * dashboard's `columns` say `title`, tricks-spec.md §7.1's `campos`
   * example says `titulo`. Reading both costs one `||`. */
  function titulo(n) {
    return n.title || n.titulo || basename(n.path);
  }

  function basename(p) {
    return String(p || "").split("/").pop().replace(/\.md$/, "");
  }

  function sinFrontmatter(txt) {
    var s = String(txt);
    if (s.slice(0, 4) !== "---\n") return s.trim();
    var end = s.indexOf("\n---", 3);
    return end === -1 ? s.trim() : s.slice(end + 4).trim();
  }

  function hoy() {
    // Local date. toISOString() is UTC and writes tomorrow's date into a
    // file every evening east of Greenwich.
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
