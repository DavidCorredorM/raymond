/* Mender — the review queue. bridge.js is loaded first.
 *
 * One card per finding in `steward/`. Each shows the strange thing, asks
 * what is true, and takes a free-text answer. Answering writes five
 * frontmatter fields back to that finding's own file — nothing else, ever.
 * The next mender run reads them: a rename it can carry out mechanically,
 * an answer about what is true goes to the agent half.
 *
 * The evidence body is fetched with vault.read only when a card is opened.
 * Twenty-five cards read eagerly would be twenty-five ops on mount, and
 * the bridge's ceiling is 20/second.
 *
 * i18n: a small lookup table, English default and Spanish second — the
 * same pattern panel/web/src/i18n/messages.ts uses for the panel's own
 * chrome, sized down to what one trick needs. `hello.locale` (the
 * deployment's configured UI language, panel/docs/tricks-spec.md §6.2) picks
 * the table; nothing here guesses from the browser. See
 * `.claude/skills/trick-creator/SKILL.md` §6 for the pattern written up for
 * any other trick that wants it.
 */
(function () {
  var ABIERTO = "abierto";

  var STRINGS = {
    en: {
      loading: "Loading…",
      showAnswered: "Show answered",
      hideAnswered: "Hide answered",
      nothingOpen: "Nothing open",
      thingsToLookAt: function (n) {
        return n + " " + (n === 1 ? "thing to look at" : "things to look at");
      },
      showEvidence: "Show the evidence",
      hideEvidence: "Hide the evidence",
      reading: "Reading…",
      empty: "(empty)",
      defaultQuestion: "What is actually true here?",
      answerPlaceholder: "What is true? Say it the way you would say it out loud.",
      save: "Save",
      applyThis: "Apply this",
      notAProblem: "Not a problem",
      cardNote:
        '“Apply this” records your answer. A rename or move is carried out by the ' +
        "next mender run; an answer about what is true is picked up by the mender skill. " +
        "Nothing changes in your notes from this page.",
      emptyState:
        "Nothing to review. Either the vault is tidy or the Mender has not run yet — " +
        "_tools/mender.py check from the vault root, or the mender skill for the half " +
        "that needs judgment.",
      footer:
        "Each card is a file in steward/. Answering here writes to that file and nothing " +
        "else; renames and moves happen on the next mender run, where they leave a diff.",
      lastRunOk: function (ts) {
        return "last run " + ts + ", ok";
      },
      lastRunFailed: function (ts, exitCode) {
        return "last run " + ts + ", FAILED exit " + exitCode;
      },
      panelTooOld: "this panel version can't report the last run yet",
      noJobInstalled: "no scheduled run installed — see the mender skill",
      capabilityDenied: function (msg) {
        return "This trick's manifest does not allow that: " + msg;
      },
      readNotGranted: function (path) {
        return (
          "This trick was not granted vault.read, so it cannot show the evidence. " +
          "Open " + path + " in the vault instead."
        );
      },
      readFailed: function (msg) {
        return "Could not read it: " + msg;
      },
      classLabels: {
        "broken-link": "broken link",
        "duplicate-basename": "duplicate name",
        filename: "filename",
        "folder-shape": "folder shape",
        orphan: "orphan",
        misplaced: "misplaced",
        contradiction: "contradiction",
        stale: "possibly stale",
      },
    },
    es: {
      loading: "Cargando…",
      showAnswered: "Mostrar respondidas",
      hideAnswered: "Ocultar respondidas",
      nothingOpen: "Nada pendiente",
      thingsToLookAt: function (n) {
        return n + " " + (n === 1 ? "cosa por revisar" : "cosas por revisar");
      },
      showEvidence: "Mostrar la evidencia",
      hideEvidence: "Ocultar la evidencia",
      reading: "Leyendo…",
      empty: "(vacío)",
      defaultQuestion: "¿Qué es realmente cierto aquí?",
      answerPlaceholder: "¿Qué es cierto? Dilo como lo dirías en voz alta.",
      save: "Guardar",
      applyThis: "Aplicar esto",
      notAProblem: "No es un problema",
      cardNote:
        "«Aplicar esto» guarda tu respuesta. Un renombre o movimiento lo hace la siguiente " +
        "corrida del mender; una respuesta sobre qué es cierto la recoge la skill mender. " +
        "Nada cambia en tus notas desde esta página.",
      emptyState:
        "Nada por revisar. O el vault está en orden, o el Mender todavía no ha corrido — " +
        "_tools/mender.py check desde la raíz del vault, o la skill mender para la parte " +
        "que necesita juicio.",
      footer:
        "Cada tarjeta es un archivo en steward/. Responder aquí escribe en ese archivo y " +
        "nada más; los renombres y movimientos ocurren en la siguiente corrida del mender, " +
        "donde dejan un diff.",
      lastRunOk: function (ts) {
        return "última corrida " + ts + ", ok";
      },
      lastRunFailed: function (ts, exitCode) {
        return "última corrida " + ts + ", FALLÓ exit " + exitCode;
      },
      panelTooOld: "esta versión del panel todavía no reporta la última corrida",
      noJobInstalled: "no hay una corrida programada instalada — ver la skill mender",
      capabilityDenied: function (msg) {
        return "El manifiesto de este truco no permite eso: " + msg;
      },
      readNotGranted: function (path) {
        return (
          "A este truco no se le concedió vault.read, así que no puede mostrar la " +
          "evidencia. Abre " + path + " en el vault en su lugar."
        );
      },
      readFailed: function (msg) {
        return "No se pudo leer: " + msg;
      },
      classLabels: {
        "broken-link": "enlace roto",
        "duplicate-basename": "nombre duplicado",
        filename: "nombre de archivo",
        "folder-shape": "forma de carpeta",
        orphan: "huérfano",
        misplaced: "mal ubicado",
        contradiction: "contradicción",
        stale: "posiblemente desactualizado",
      },
    },
  };
  var L = STRINGS.en; // replaced once the hello arrives (Bridge.ready, below)

  var elResumen = document.getElementById("resumen");
  var elCorrida = document.getElementById("corrida");
  var elError = document.getElementById("error");
  var elTarjetas = document.getElementById("tarjetas");
  var elVacio = document.getElementById("vacio");
  var elFooter = document.getElementById("pie");
  var btnCerradas = document.getElementById("ver-cerradas");

  var findings = [];
  var verCerradas = false;
  var abiertas = {};   // path -> true, which cards are expanded
  var cuerpos = {};    // path -> evidence text, once read

  Bridge.ready(function (hello) {
    L = STRINGS[hello.locale] || STRINGS.en;
    elVacio.textContent = L.emptyState;
    elFooter.textContent = L.footer;
    btnCerradas.textContent = verCerradas ? L.hideAnswered : L.showAnswered;
    elResumen.textContent = L.loading;
    cargar();
    estadoDelTrabajo();
  });

  Bridge.on(function (ev) {
    // The mender runs unattended. "The files changed while nobody was
    // looking" is the normal case here, not an edge case.
    if (ev.ev === "datos.cambiaron") {
      cuerpos = {};
      cargar();
    }
  });

  btnCerradas.addEventListener("click", function () {
    verCerradas = !verCerradas;
    btnCerradas.textContent = verCerradas ? L.hideAnswered : L.showAnswered;
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
        elCorrida.textContent = ok
          ? L.lastRunOk(r.timestamp || "?")
          : L.lastRunFailed(r.timestamp || "?", r.exitCode);
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
            ? L.panelTooOld
            : L.noJobInstalled;
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
    elResumen.textContent = open ? L.thingsToLookAt(open) : L.nothingOpen;
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
    q.textContent = campo(n, "pregunta") || L.defaultQuestion;
    art.appendChild(q);

    var ver = document.createElement("button");
    ver.type = "button";
    ver.className = "ligero";
    ver.textContent = abiertas[n.path] ? L.hideEvidence : L.showEvidence;
    ver.addEventListener("click", function () {
      abiertas[n.path] = !abiertas[n.path];
      if (abiertas[n.path]) leerCuerpo(n);
      pintar();
    });
    art.appendChild(ver);

    if (abiertas[n.path]) {
      var pre = document.createElement("pre");
      pre.className = "evidencia";
      pre.textContent = cuerpos[n.path] || L.reading;
      art.appendChild(pre);
    }

    var previa = campo(n, "respuesta");
    var ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = L.answerPlaceholder;
    ta.value = previa || "";
    art.appendChild(ta);

    var acciones = document.createElement("div");
    acciones.className = "acciones";
    acciones.appendChild(boton(L.save, "ligero", function () {
      responder(art, n, ta.value, "", ABIERTO);
    }));
    acciones.appendChild(boton(L.applyThis, "primario", function () {
      responder(art, n, ta.value, "aplicar", "respondido");
    }));
    acciones.appendChild(boton(L.notAProblem, "ligero", function () {
      responder(art, n, ta.value, "descartar", "respondido");
    }));
    art.appendChild(acciones);

    var nota = document.createElement("p");
    nota.className = "sutil";
    nota.textContent = L.cardNote;
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
      cuerpos[n.path] = L.readNotGranted(n.path);
      return;
    }
    Bridge.call("vault.read", { path: n.path })
      .then(function (res) {
        // assumed: the result shape. tricks-spec.md pins the server's
        // checks for vault.read, not the name of the field it answers
        // with. Reading the three plausible ones costs one expression.
        var txt = typeof res === "string" ? res
          : (res && (res.contenido || res.content || res.texto || res.text)) || "";
        cuerpos[n.path] = sinFrontmatter(txt) || L.empty;
        pintar();
      })
      .catch(function (err) {
        cuerpos[n.path] = L.readFailed(err.message);
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
    return L.classLabels[k] || k;
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

  function mostrarError(err) {
    if (!err) {
      elError.hidden = true;
      return;
    }
    elError.hidden = false;
    elError.textContent =
      err.code === "capability_denied" ? L.capabilityDenied(err.message) : err.message;
  }
})();
