/**
 * The UI chrome dictionary — every translated string in the panel, in one
 * place, English and Spanish side by side.
 *
 * Why a plain lookup table instead of a library (react-i18next and
 * similar): this app has exactly one language to add, not an open-ended
 * localization problem, and the audience is explicitly non-coders running
 * a small deployment (README, "the vision") — a runtime that parses ICU
 * plural rules and lazy-loads namespace bundles is solving a problem this
 * app doesn't have. `panel/web` is already careful about bundle weight
 * (App.tsx code-splits react-force-graph-2d and the CodeMirror chunks
 * specifically because they're large; see the commit history around the
 * live-preview and preview-viewer work) — a few kB of `const en = {...}`
 * is the opposite of that problem.
 *
 * `Messages` is the single source of truth for shape: `en` and `es` are
 * both typed against it, so a key present in one and missing in the other
 * is a compile error, not a blank string discovered in production. Every
 * value is either a plain string or a function that takes the exact
 * arguments the call site has on hand (a count, a filename, a status) and
 * returns a string — no positional `%s` templates to get wrong in
 * translation, and TypeScript checks every call site's argument types.
 *
 * Composite sentences that embed a link or a `<code>` span use `{token}`
 * markers instead of JSX, resolved by `interpolate()` at the call site —
 * see that file for why.
 */
export interface Messages {
  nav: {
    home: string;
    vault: string;
    tricks: string;
    settings: string;
  };
  vaultSubnav: {
    notes: string;
    graph: string;
    health: string;
  };
  common: {
    loading: string;
    /** "Loading {what}…" — graph, editor, table view, etc. */
    loadingWhat: (what: string) => string;
    loadingTableView: string;
    loadingTextView: string;
    loadingSourceView: string;
    reading: (name: string) => string;
    download: string;
    cancel: string;
  };
  welcome: {
    title: string;
    notesIndexed: (n: number) => string;
    /** Tokens: {graph}, {health}. */
    pickNoteTemplate: string;
    graphLink: string;
    healthLink: string;
  };
  home: {
    /** Tokens: {path}, {widgetsField}, {specPath}, {vaultLink}. */
    noDashboardTemplate: string;
    vaultLinkText: string;
    /** Tokens: {path}, {widgetsField}. */
    noWidgetsTemplate: string;
  };
  health: {
    loading: string;
    title: string;
    statNotes: string;
    statIndexedFiles: string;
    statBrokenLinks: string;
    statSlugCollisions: string;
    statMissingFrontmatter: string;
    brokenLinksHeading: (n: number) => string;
    none: string;
    colFrom: string;
    colTargetUnresolved: string;
    slugCollisionsHeading: (n: number) => string;
    colSlug: string;
    colPaths: string;
    missingFrontmatterHeading: (n: number) => string;
  };
  note: {
    noneSelected: string;
    loading: string;
    couldNotLoad: (path: string) => string;
    unsavedChanges: string;
    saved: string;
    saving: string;
    save: string;
    view: string;
    edit: string;
    renameThisNote: string;
    saveFailed: (msg: string) => string;
    frontmatterHeading: (n: number) => string;
    loadingEditor: string;
    resizeBacklinksPanel: string;
    renameDialogTitle: string;
    linkedFromNotes: (n: number) => string;
    nothingLinksYet: string;
  };
  attachment: {
    noneSelected: string;
    download: string;
    renameThisFile: string;
    couldNotLoadIndex: (msg: string) => string;
    notInIndex: string;
    renameDialogTitle: string;
    filesNotLinked: string;
  };
  vaultShell: {
    loadingNotes: string;
    systemFilesToggle: (n: number) => string;
    attachmentIndexError: string;
    resizeNoteList: string;
  };
  tricks: {
    loading: string;
    couldNotLoad: string;
    title: string;
    emptyIntro: string;
    emptyHowToPrefix: string;
    emptyHowToSuffix: string;
    countFound: (n: number) => string;
    noCapabilities: string;
  };
  trickDetail: {
    noneSelected: string;
    loading: string;
    couldNotLoad: (name: string) => string;
    skippedNote: string;
    backToTricks: string;
  };
  graph: {
    loading: string;
    noNotes: string;
  };
  backlinks: {
    heading: string;
    headingWithCount: (n: number) => string;
    none: string;
  };
  claudeLauncher: {
    label: string;
    title: string;
  };
  folderUpload: {
    uploadInto: (label: string) => string;
    fileExistsQuestion: (fileName: string) => string;
    fileExistsAriaLabel: string;
    replace: string;
    skip: string;
    uploadingStatus: (fileName: string, percent: number) => string;
    progressPrefix: (index: number, total: number) => string;
    uploadedTo: (label: string) => string;
    uploadedNTo: (n: number, label: string) => string;
    moreFilesNotUploaded: (n: number) => string;
    uploadOfFileFailed: (fileName: string, msg: string) => string;
    couldNotReach: (fileName: string) => string;
    alreadyExists: (fileName: string) => string;
    overLimit: (fileName: string, limitMb: number) => string;
    rejected: (fileName: string, detail: string) => string;
    rejectedNoDetail: (fileName: string) => string;
    noUploadEndpoint: (fileName: string) => string;
    uploadFailedStatus: (fileName: string, status: number) => string;
    uploadFailedStatusDetail: (fileName: string, status: number, detail: string) => string;
  };
  noteTree: {
    vaultRoot: string;
    /** Lowercase, mid-sentence form — fed into folderUpload.uploadInto("{this}"). */
    vaultRootLower: string;
    noMatch: string;
  };
  renameDialog: {
    newName: string;
    cancel: string;
    renaming: string;
    rename: string;
  };
  resizablePanel: {
    dragOrEnterToOpen: string;
    dragToResizeDoubleClickFold: string;
  };
  searchBox: {
    placeholder: string;
    ariaLabel: string;
  };
  dashboard: {
    noWidgets: string;
    untitledWidget: string;
    unknownWidgetKind: (kind: string) => string;
    widgetFailed: (msg: string) => string;
  };
  widgetQuery: {
    noMatches: string;
  };
  widgetHealth: {
    brokenLinks: string;
    slugCollisions: string;
    missingFrontmatter: string;
    fullReport: string;
  };
  preview: {
    tooLargeToPreview: (limit: string) => string;
    rendered: string;
    source: string;
    sandboxedStatus: string;
    openInNewTab: string;
    previewOfName: (name: string) => string;
    pdfPreviewOfName: (name: string) => string;
    fit: string;
    actualSize: string;
    imageDecodeFailed: string;
    audioStatus: string;
    videoStatus: string;
    codecUnsupported: string;
    playbackFailed: string;
    exitFullScreen: string;
    fullScreen: string;
    couldntRead: (msg: string) => string;
    tooLargeAsTable: (msg: string) => string;
    tooLargeAsText: (msg: string) => string;
    emptyFile: string;
    rowsStatusTruncated: (shown: string, total: string, cols: number) => string;
    /** `n` is the raw row count, for singular/plural; `total` is the pre-formatted (toLocaleString) form. */
    rowsStatus: (n: number, total: string, cols: number) => string;
    table: string;
    rawText: string;
    /** Tokens: {shown}, {total} pre-formatted; plain string otherwise. */
    showingFirstRows: (shown: string, total: string) => string;
    pdfViewerDisabled: string;
    browserPdfViewerStatus: string;
    /** Tokens: {name}, {download}. */
    cantDisplayPdfTemplate: string;
    downloadLinkText: (name: string) => string;
    lines: (n: number) => string;
    noPreviewFor: (ext: string) => string;
    noPreviewForNoExtension: string;
    noReaderSpreadsheetOffice: string;
    noReaderSpreadsheetOds: string;
    noReaderWordOffice: string;
    noReaderTextOdt: string;
    noReaderPowerpointOffice: string;
    noReaderPresentationOdp: string;
    noReaderArchive: string;
    /** TooLargeError's own message (useAttachmentText.ts) — `bytes` and `limit` pre-formatted with formatBytes. */
    overTextPreviewLimit: (bytes: string, limit: string) => string;
    /** fetchText's own HTTP-failure message (useAttachmentText.ts). */
    readingFailed: (path: string, status: number) => string;
  };
  trickHost: {
    miniAppLabel: string;
    noCapabilitiesNoBridge: string;
    navigatedAwayTitle: string;
    /** Tokens: {name}. */
    navigatedAwayBodyTemplate: string;
    noBridgeNote: string;
    refusedCall: (n: number) => string;
    clear: string;
    /** Tokens: {capabilityDenied}, {trickYaml}. */
    capabilityDeniedNoteTemplate: string;
  };
  unsavedGuard: {
    confirmMessage: string;
  };
  settings: {
    title: string;
    description: string;
    languageLabel: string;
    english: string;
    spanish: string;
    saved: string;
    saveFailed: (msg: string) => string;
    saving: string;
  };
}

export const en: Messages = {
  nav: {
    home: "Home",
    vault: "Vault",
    tricks: "Tricks",
    settings: "Settings",
  },
  vaultSubnav: {
    notes: "Notes",
    graph: "Graph",
    health: "Health",
  },
  common: {
    loading: "Loading…",
    loadingWhat: (what) => `Loading ${what}…`,
    loadingTableView: "Loading table view…",
    loadingTextView: "Loading text view…",
    loadingSourceView: "Loading source view…",
    reading: (name) => `Reading ${name}…`,
    download: "Download",
    cancel: "Cancel",
  },
  welcome: {
    title: "Vault",
    notesIndexed: (n) => `${n} notes indexed.`,
    pickNoteTemplate: "Pick a note from the tree, or open {graph} or {health}.",
    graphLink: "the graph",
    healthLink: "vault health",
  },
  home: {
    noDashboardTemplate:
      "No dashboard yet at {path}. Create a note there with a {widgetsField} frontmatter array to make this your home page — see the widget spec in {specPath} §5, or start browsing the {vaultLink}.",
    vaultLinkText: "vault",
    noWidgetsTemplate:
      "{path} exists but has no {widgetsField} array, so nothing renders below — add one to turn it into a dashboard.",
  },
  health: {
    loading: "Loading vault health…",
    title: "Vault health",
    statNotes: "notes",
    statIndexedFiles: "indexed files",
    statBrokenLinks: "broken links",
    statSlugCollisions: "slug collisions",
    statMissingFrontmatter: "missing frontmatter",
    brokenLinksHeading: (n) => `Broken links (${n})`,
    none: "None.",
    colFrom: "From",
    colTargetUnresolved: "Target (unresolved)",
    slugCollisionsHeading: (n) => `Slug collisions (${n})`,
    colSlug: "Slug",
    colPaths: "Paths",
    missingFrontmatterHeading: (n) => `Missing frontmatter (${n})`,
  },
  note: {
    noneSelected: "No note selected.",
    loading: "Loading…",
    couldNotLoad: (path) => `Could not load ${path}.`,
    unsavedChanges: "Unsaved changes",
    saved: "Saved",
    saving: "Saving…",
    save: "Save",
    view: "View",
    edit: "Edit",
    renameThisNote: "Rename this note",
    saveFailed: (msg) => `Save failed: ${msg}`,
    frontmatterHeading: (n) => `Frontmatter (${n})`,
    loadingEditor: "Loading editor…",
    resizeBacklinksPanel: "Resize the backlinks panel",
    renameDialogTitle: "Rename note",
    linkedFromNotes: (n) =>
      `This note is linked from ${n} other note${n === 1 ? "" : "s"}; they will be updated automatically.`,
    nothingLinksYet: "Nothing links to this note yet.",
  },
  attachment: {
    noneSelected: "No file selected.",
    download: "Download",
    renameThisFile: "Rename this file",
    couldNotLoadIndex: (msg) =>
      `Could not load the attachment index: ${msg}. The preview below still works if the file is there.`,
    notInIndex: "Not in the vault's attachment index — it may have been moved or deleted.",
    renameDialogTitle: "Rename file",
    filesNotLinked: "Files aren't referenced by [[links]] the way notes are, so nothing else needs updating.",
  },
  vaultShell: {
    loadingNotes: "Loading notes…",
    systemFilesToggle: (n) => `Show ${n} system file${n === 1 ? "" : "s"}`,
    attachmentIndexError:
      "Files other than notes aren't listed — the panel server didn't answer /api/attachments.",
    resizeNoteList: "Resize the note list",
  },
  tricks: {
    loading: "Loading…",
    couldNotLoad: "Could not load tricks.",
    title: "Tricks",
    emptyIntro:
      "A trick is a small web app that runs over this vault — a checklist, a form, a chart, a drawing pad, a button that runs a script. Arbitrary HTML, CSS and JavaScript in a sandboxed frame with no network of its own, reaching the vault only through the capabilities its manifest declares. This vault doesn't have any yet.",
    emptyHowToPrefix:
      'Tricks aren\'t built by hand: open Claude Code in this vault and describe what you want tracked — "make me a reading list", "I want a habit tracker" — and the ',
    emptyHowToSuffix: " skill writes the folder for you. Nothing to install, no rebuild.",
    countFound: (n) => `${n} trick${n === 1 ? "" : "s"} found in this vault.`,
    noCapabilities: "no capabilities",
  },
  trickDetail: {
    noneSelected: "No trick selected.",
    loading: "Loading…",
    couldNotLoad: (name) => `Could not load trick "${name}".`,
    skippedNote:
      "A trick whose trick.yaml fails validation is skipped rather than half-rendered; the panel's log says which rule it broke.",
    backToTricks: "Tricks",
  },
  graph: {
    loading: "Loading graph…",
    noNotes: "No notes to graph yet — add some [[links]] between notes.",
  },
  backlinks: {
    heading: "Backlinks",
    headingWithCount: (n) => `Backlinks (${n})`,
    none: "Nothing links here yet.",
  },
  claudeLauncher: {
    label: "Claude Code",
    title: "Open Claude Code in a new tab to start a chat",
  },
  folderUpload: {
    uploadInto: (label) => `Upload a file into ${label}`,
    fileExistsQuestion: (fileName) => `${fileName} already exists here — replace it?`,
    fileExistsAriaLabel: "File already exists",
    replace: "Replace",
    skip: "Skip",
    uploadingStatus: (fileName, percent) => `Uploading ${fileName} — ${percent}%`,
    progressPrefix: (index, total) => `(${index}/${total}) `,
    uploadedTo: (label) => `Uploaded to ${label}`,
    uploadedNTo: (n, label) => `Uploaded ${n} files to ${label}`,
    moreFilesNotUploaded: (n) => `${n} more file(s) were not uploaded.`,
    uploadOfFileFailed: (fileName, msg) => `Upload of ${fileName} failed: ${msg}`,
    couldNotReach: (fileName) =>
      `Couldn't reach the panel server while uploading ${fileName}. Check the connection and try again.`,
    alreadyExists: (fileName) => `${fileName} already exists in this folder.`,
    overLimit: (fileName, limitMb) =>
      `${fileName} is over the ${limitMb} MB upload limit. Put it somewhere else and link to it, or split it up.`,
    rejected: (fileName, detail) => `The server rejected ${fileName}: ${detail}. Renaming the file usually fixes this.`,
    rejectedNoDetail: (fileName) =>
      `The server rejected ${fileName} (bad request). Renaming the file usually fixes this.`,
    noUploadEndpoint: (fileName) =>
      `This panel's server has no upload endpoint (${fileName} was not sent). It needs the attachments backend deployed.`,
    uploadFailedStatus: (fileName, status) => `Upload of ${fileName} failed (${status}).`,
    uploadFailedStatusDetail: (fileName, status, detail) =>
      `Upload of ${fileName} failed (${status}): ${detail}.`,
  },
  noteTree: {
    vaultRoot: "Vault root",
    vaultRootLower: "the vault root",
    noMatch: "No notes match.",
  },
  renameDialog: {
    newName: "New name",
    cancel: "Cancel",
    renaming: "Renaming…",
    rename: "Rename",
  },
  resizablePanel: {
    dragOrEnterToOpen: "Drag or press Enter to open",
    dragToResizeDoubleClickFold: "Drag to resize, double-click to fold",
  },
  searchBox: {
    placeholder: "Search notes…",
    ariaLabel: "Search notes",
  },
  dashboard: {
    noWidgets: "This dashboard has no widgets configured.",
    untitledWidget: "Untitled widget",
    unknownWidgetKind: (kind) => `Unknown widget kind: ${kind}`,
    widgetFailed: (msg) => `Widget failed to render: ${msg}`,
  },
  widgetQuery: {
    noMatches: "No matching notes.",
  },
  widgetHealth: {
    brokenLinks: "broken links",
    slugCollisions: "slug collisions",
    missingFrontmatter: "missing frontmatter",
    fullReport: "Full report →",
  },
  preview: {
    tooLargeToPreview: (limit) =>
      `Too large to preview in the browser — this reads the whole file into the tab, and the limit is ${limit}.`,
    rendered: "Rendered",
    source: "Source",
    sandboxedStatus: "Sandboxed — scripts run, the page can't reach the panel",
    openInNewTab: "Open in new tab",
    previewOfName: (name) => `Preview of ${name}`,
    pdfPreviewOfName: (name) => `PDF preview of ${name}`,
    fit: "Fit",
    actualSize: "Actual size",
    imageDecodeFailed:
      "The browser could not decode this image — it may be truncated, or in a format this browser doesn't support.",
    audioStatus: "Audio",
    videoStatus: "Video",
    codecUnsupported: "This browser can't decode this file's codec or container. Download it and open it in a media player.",
    playbackFailed: "Playback failed — the file may be truncated or the connection dropped.",
    exitFullScreen: "Exit full screen",
    fullScreen: "Full screen",
    couldntRead: (msg) => `Couldn't read this file: ${msg}.`,
    tooLargeAsTable: (msg) => `Too large to show as a table — ${msg}.`,
    tooLargeAsText: (msg) => `Too large to show as text — ${msg}.`,
    emptyFile: "This file is empty.",
    rowsStatusTruncated: (shown, total, cols) => `${shown} of ${total} rows · ${cols} columns`,
    rowsStatus: (n, total, cols) => `${total} row${n === 1 ? "" : "s"} · ${cols} columns`,
    table: "Table",
    rawText: "Raw text",
    showingFirstRows: (shown, total) => `Showing the first ${shown} of ${total} rows. Download the file to see all of it.`,
    pdfViewerDisabled: "This browser is set to download PDFs rather than display them, so there's no viewer to embed.",
    browserPdfViewerStatus: "Browser PDF viewer",
    cantDisplayPdfTemplate: "This browser can't display PDFs inline. {download}.",
    downloadLinkText: (name) => `Download ${name}`,
    lines: (n) => `${n} line${n === 1 ? "" : "s"}`,
    noPreviewFor: (ext) => `There's no preview for .${ext} — download it to open it in whatever app owns it.`,
    noPreviewForNoExtension: "There's no preview for files without an extension — download it to open it in whatever app owns it.",
    noReaderSpreadsheetOffice: "Spreadsheets have no preview yet — download it to open in Excel or Numbers.",
    noReaderSpreadsheetOds: "Spreadsheets have no preview yet — download it to open in a spreadsheet app.",
    noReaderWordOffice: "Word documents have no preview yet — download it to open in Word or Pages.",
    noReaderTextOdt: "Text documents have no preview yet — download it to open in a word processor.",
    noReaderPowerpointOffice: "PowerPoint has no preview yet — download it to open in PowerPoint or Keynote.",
    noReaderPresentationOdp: "Presentations have no preview yet — download it to open in a presentation app.",
    noReaderArchive: "Archives aren't unpacked in the browser — download it to open it.",
    overTextPreviewLimit: (bytes, limit) => `${bytes} is over the ${limit} limit for previewing a file as text`,
    readingFailed: (path, status) => `Reading ${path} failed (${status})`,
  },
  trickHost: {
    miniAppLabel: "mini app",
    noCapabilitiesNoBridge: "no capabilities — no bridge",
    navigatedAwayTitle: "This trick navigated away from its app.",
    navigatedAwayBodyTemplate:
      "The panel unmounted it and did not hand the new document a capability port. Reload the page to mount {name} again.",
    noBridgeNote:
      "This trick declared no capabilities, so it was mounted with no bridge at all — it can draw, but it cannot read or write anything.",
    refusedCall: (n) => `refused call${n === 1 ? "" : "s"}`,
    clear: "Clear",
    capabilityDeniedNoteTemplate:
      "{capabilityDenied} means the app asked for something its {trickYaml} does not declare. Add the capability to the manifest, or stop the app asking — the panel will not guess.",
  },
  unsavedGuard: {
    confirmMessage: "You have unsaved changes to this note. Leave without saving?",
  },
  settings: {
    title: "Settings",
    description: "Language for the panel's own buttons, labels and messages. Your notes and their content are never translated — they stay whatever language you write them in.",
    languageLabel: "Language",
    english: "English",
    spanish: "Español",
    saved: "Saved.",
    saveFailed: (msg) => `Couldn't save: ${msg}`,
    saving: "Saving…",
  },
};

export const es: Messages = {
  nav: {
    home: "Inicio",
    vault: "Vault",
    tricks: "Trucos",
    settings: "Ajustes",
  },
  vaultSubnav: {
    notes: "Notas",
    graph: "Grafo",
    health: "Salud",
  },
  common: {
    loading: "Cargando…",
    loadingWhat: (what) => `Cargando ${what}…`,
    loadingTableView: "Cargando la vista de tabla…",
    loadingTextView: "Cargando la vista de texto…",
    loadingSourceView: "Cargando el código fuente…",
    reading: (name) => `Leyendo ${name}…`,
    download: "Descargar",
    cancel: "Cancelar",
  },
  welcome: {
    title: "Vault",
    notesIndexed: (n) => `${n} notas indexadas.`,
    pickNoteTemplate: "Elige una nota del árbol, o abre {graph} o {health}.",
    graphLink: "el grafo",
    healthLink: "la salud del vault",
  },
  home: {
    noDashboardTemplate:
      "Todavía no hay un dashboard en {path}. Crea una nota ahí con un arreglo de frontmatter {widgetsField} para convertirla en tu página de inicio — mira la especificación de widgets en {specPath} §5, o empieza a explorar el {vaultLink}.",
    vaultLinkText: "vault",
    noWidgetsTemplate:
      "{path} existe pero no tiene un arreglo {widgetsField}, así que no se muestra nada abajo — agrega uno para convertirla en un dashboard.",
  },
  health: {
    loading: "Cargando la salud del vault…",
    title: "Salud del vault",
    statNotes: "notas",
    statIndexedFiles: "archivos indexados",
    statBrokenLinks: "enlaces rotos",
    statSlugCollisions: "colisiones de slug",
    statMissingFrontmatter: "sin frontmatter",
    brokenLinksHeading: (n) => `Enlaces rotos (${n})`,
    none: "Ninguno.",
    colFrom: "Desde",
    colTargetUnresolved: "Destino (sin resolver)",
    slugCollisionsHeading: (n) => `Colisiones de slug (${n})`,
    colSlug: "Slug",
    colPaths: "Rutas",
    missingFrontmatterHeading: (n) => `Sin frontmatter (${n})`,
  },
  note: {
    noneSelected: "No hay ninguna nota seleccionada.",
    loading: "Cargando…",
    couldNotLoad: (path) => `No se pudo cargar ${path}.`,
    unsavedChanges: "Cambios sin guardar",
    saved: "Guardado",
    saving: "Guardando…",
    save: "Guardar",
    view: "Ver",
    edit: "Editar",
    renameThisNote: "Renombrar esta nota",
    saveFailed: (msg) => `No se pudo guardar: ${msg}`,
    frontmatterHeading: (n) => `Frontmatter (${n})`,
    loadingEditor: "Cargando el editor…",
    resizeBacklinksPanel: "Redimensionar el panel de enlaces entrantes",
    renameDialogTitle: "Renombrar nota",
    linkedFromNotes: (n) =>
      `Esta nota está enlazada desde ${n} otra${n === 1 ? "" : "s"} nota${n === 1 ? "" : "s"}; se actualizarán automáticamente.`,
    nothingLinksYet: "Todavía nada enlaza a esta nota.",
  },
  attachment: {
    noneSelected: "No hay ningún archivo seleccionado.",
    download: "Descargar",
    renameThisFile: "Renombrar este archivo",
    couldNotLoadIndex: (msg) =>
      `No se pudo cargar el índice de archivos: ${msg}. La vista previa de abajo funciona igual si el archivo está ahí.`,
    notInIndex: "No está en el índice de archivos del vault — puede que se haya movido o eliminado.",
    renameDialogTitle: "Renombrar archivo",
    filesNotLinked: "Los archivos no se referencian con [[enlaces]] como las notas, así que no hay nada más que actualizar.",
  },
  vaultShell: {
    loadingNotes: "Cargando notas…",
    systemFilesToggle: (n) => `Mostrar ${n} archivo${n === 1 ? "" : "s"} del sistema`,
    attachmentIndexError:
      "No se listan archivos aparte de las notas — el servidor del panel no respondió /api/attachments.",
    resizeNoteList: "Redimensionar la lista de notas",
  },
  tricks: {
    loading: "Cargando…",
    couldNotLoad: "No se pudieron cargar los trucos.",
    title: "Trucos",
    emptyIntro:
      "Un truco es una pequeña app web que corre sobre este vault — una lista de tareas, un formulario, una gráfica, un lienzo de dibujo, un botón que ejecuta un script. HTML, CSS y JavaScript arbitrarios en un marco aislado sin red propia, que solo llega al vault a través de las capacidades que declara su manifiesto. Este vault todavía no tiene ninguno.",
    emptyHowToPrefix:
      'Los trucos no se construyen a mano: abre Claude Code en este vault y describe qué quieres registrar — "hazme una lista de lectura", "quiero un rastreador de hábitos" — y la skill ',
    emptyHowToSuffix: " escribe la carpeta por ti. Nada que instalar, ninguna reconstrucción.",
    countFound: (n) => `${n} truco${n === 1 ? "" : "s"} encontrado${n === 1 ? "" : "s"} en este vault.`,
    noCapabilities: "sin capacidades",
  },
  trickDetail: {
    noneSelected: "No hay ningún truco seleccionado.",
    loading: "Cargando…",
    couldNotLoad: (name) => `No se pudo cargar el truco "${name}".`,
    skippedNote:
      "Un truco cuyo trick.yaml no pasa la validación se omite en vez de mostrarse a medias; el log del panel dice qué regla incumplió.",
    backToTricks: "Trucos",
  },
  graph: {
    loading: "Cargando el grafo…",
    noNotes: "Todavía no hay notas para graficar — agrega algunos [[enlaces]] entre notas.",
  },
  backlinks: {
    heading: "Enlaces entrantes",
    headingWithCount: (n) => `Enlaces entrantes (${n})`,
    none: "Todavía nada enlaza aquí.",
  },
  claudeLauncher: {
    label: "Claude Code",
    title: "Abrir Claude Code en una pestaña nueva para empezar un chat",
  },
  folderUpload: {
    uploadInto: (label) => `Subir un archivo a ${label}`,
    fileExistsQuestion: (fileName) => `${fileName} ya existe aquí — ¿reemplazarlo?`,
    fileExistsAriaLabel: "El archivo ya existe",
    replace: "Reemplazar",
    skip: "Omitir",
    uploadingStatus: (fileName, percent) => `Subiendo ${fileName} — ${percent}%`,
    progressPrefix: (index, total) => `(${index}/${total}) `,
    uploadedTo: (label) => `Subido a ${label}`,
    uploadedNTo: (n, label) => `${n} archivos subidos a ${label}`,
    moreFilesNotUploaded: (n) => `${n} archivo(s) más no se subieron.`,
    uploadOfFileFailed: (fileName, msg) => `Falló la subida de ${fileName}: ${msg}`,
    couldNotReach: (fileName) =>
      `No se pudo contactar al servidor del panel al subir ${fileName}. Revisa la conexión e inténtalo de nuevo.`,
    alreadyExists: (fileName) => `${fileName} ya existe en esta carpeta.`,
    overLimit: (fileName, limitMb) =>
      `${fileName} supera el límite de subida de ${limitMb} MB. Ponlo en otro lugar y enlázalo, o divídelo en partes.`,
    rejected: (fileName, detail) => `El servidor rechazó ${fileName}: ${detail}. Renombrar el archivo suele arreglarlo.`,
    rejectedNoDetail: (fileName) =>
      `El servidor rechazó ${fileName} (solicitud inválida). Renombrar el archivo suele arreglarlo.`,
    noUploadEndpoint: (fileName) =>
      `El servidor de este panel no tiene endpoint de subida (${fileName} no se envió). Necesita el backend de archivos adjuntos desplegado.`,
    uploadFailedStatus: (fileName, status) => `Falló la subida de ${fileName} (${status}).`,
    uploadFailedStatusDetail: (fileName, status, detail) =>
      `Falló la subida de ${fileName} (${status}): ${detail}.`,
  },
  noteTree: {
    vaultRoot: "Raíz del vault",
    vaultRootLower: "la raíz del vault",
    noMatch: "Ninguna nota coincide.",
  },
  renameDialog: {
    newName: "Nuevo nombre",
    cancel: "Cancelar",
    renaming: "Renombrando…",
    rename: "Renombrar",
  },
  resizablePanel: {
    dragOrEnterToOpen: "Arrastra o presiona Enter para abrir",
    dragToResizeDoubleClickFold: "Arrastra para redimensionar, doble clic para plegar",
  },
  searchBox: {
    placeholder: "Buscar notas…",
    ariaLabel: "Buscar notas",
  },
  dashboard: {
    noWidgets: "Este dashboard no tiene widgets configurados.",
    untitledWidget: "Widget sin título",
    unknownWidgetKind: (kind) => `Tipo de widget desconocido: ${kind}`,
    widgetFailed: (msg) => `El widget no se pudo mostrar: ${msg}`,
  },
  widgetQuery: {
    noMatches: "Ninguna nota coincide.",
  },
  widgetHealth: {
    brokenLinks: "enlaces rotos",
    slugCollisions: "colisiones de slug",
    missingFrontmatter: "sin frontmatter",
    fullReport: "Ver reporte completo →",
  },
  preview: {
    tooLargeToPreview: (limit) =>
      `Demasiado grande para previsualizar en el navegador — esto carga el archivo completo en la pestaña, y el límite es ${limit}.`,
    rendered: "Renderizado",
    source: "Código fuente",
    sandboxedStatus: "Aislado — los scripts corren, la página no puede llegar al panel",
    openInNewTab: "Abrir en pestaña nueva",
    previewOfName: (name) => `Vista previa de ${name}`,
    pdfPreviewOfName: (name) => `Vista previa del PDF ${name}`,
    fit: "Ajustar",
    actualSize: "Tamaño real",
    imageDecodeFailed:
      "El navegador no pudo decodificar esta imagen — puede estar truncada, o en un formato que este navegador no soporta.",
    audioStatus: "Audio",
    videoStatus: "Video",
    codecUnsupported: "Este navegador no puede decodificar el códec o contenedor de este archivo. Descárgalo y ábrelo en un reproductor.",
    playbackFailed: "Falló la reproducción — el archivo puede estar truncado o se cortó la conexión.",
    exitFullScreen: "Salir de pantalla completa",
    fullScreen: "Pantalla completa",
    couldntRead: (msg) => `No se pudo leer este archivo: ${msg}.`,
    tooLargeAsTable: (msg) => `Demasiado grande para mostrar como tabla — ${msg}.`,
    tooLargeAsText: (msg) => `Demasiado grande para mostrar como texto — ${msg}.`,
    emptyFile: "Este archivo está vacío.",
    rowsStatusTruncated: (shown, total, cols) => `${shown} de ${total} filas · ${cols} columnas`,
    rowsStatus: (n, total, cols) => `${total} fila${n === 1 ? "" : "s"} · ${cols} columnas`,
    table: "Tabla",
    rawText: "Texto sin formato",
    showingFirstRows: (shown, total) => `Mostrando las primeras ${shown} de ${total} filas. Descarga el archivo para verlo completo.`,
    pdfViewerDisabled: "Este navegador está configurado para descargar los PDF en vez de mostrarlos, así que no hay visor que incrustar.",
    browserPdfViewerStatus: "Visor de PDF del navegador",
    cantDisplayPdfTemplate: "Este navegador no puede mostrar PDF en línea. {download}.",
    downloadLinkText: (name) => `Descarga ${name}`,
    lines: (n) => `${n} línea${n === 1 ? "" : "s"}`,
    noPreviewFor: (ext) => `No hay vista previa para .${ext} — descárgalo para abrirlo con la app que corresponda.`,
    noPreviewForNoExtension: "No hay vista previa para archivos sin extensión — descárgalo para abrirlo con la app que corresponda.",
    noReaderSpreadsheetOffice: "Las hojas de cálculo todavía no tienen vista previa — descárgala para abrirla en Excel o Numbers.",
    noReaderSpreadsheetOds: "Las hojas de cálculo todavía no tienen vista previa — descárgala para abrirla en una app de hojas de cálculo.",
    noReaderWordOffice: "Los documentos de Word todavía no tienen vista previa — descárgalo para abrirlo en Word o Pages.",
    noReaderTextOdt: "Los documentos de texto todavía no tienen vista previa — descárgalo para abrirlo en un procesador de texto.",
    noReaderPowerpointOffice: "PowerPoint todavía no tiene vista previa — descárgalo para abrirlo en PowerPoint o Keynote.",
    noReaderPresentationOdp: "Las presentaciones todavía no tienen vista previa — descárgala para abrirla en una app de presentaciones.",
    noReaderArchive: "Los archivos comprimidos no se descomprimen en el navegador — descárgalo para abrirlo.",
    overTextPreviewLimit: (bytes, limit) => `${bytes} supera el límite de ${limit} para previsualizar un archivo como texto`,
    readingFailed: (path, status) => `Falló la lectura de ${path} (${status})`,
  },
  trickHost: {
    miniAppLabel: "mini app",
    noCapabilitiesNoBridge: "sin capacidades — sin puente",
    navigatedAwayTitle: "Este truco navegó fuera de su app.",
    navigatedAwayBodyTemplate:
      "El panel lo desmontó y no le dio al documento nuevo un puerto de capacidades. Recarga la página para montar {name} de nuevo.",
    noBridgeNote:
      "Este truco no declaró capacidades, así que se montó sin puente — puede dibujar, pero no puede leer ni escribir nada.",
    refusedCall: (n) => `llamada${n === 1 ? "" : "s"} rechazada${n === 1 ? "" : "s"}`,
    clear: "Limpiar",
    capabilityDeniedNoteTemplate:
      "{capabilityDenied} significa que la app pidió algo que su {trickYaml} no declara. Agrega la capacidad al manifiesto, o deja de pedirla — el panel no va a adivinar.",
  },
  unsavedGuard: {
    confirmMessage: "Tienes cambios sin guardar en esta nota. ¿Salir sin guardar?",
  },
  settings: {
    title: "Ajustes",
    description: "Idioma de los botones, etiquetas y mensajes propios del panel. Tus notas y su contenido nunca se traducen — se quedan en el idioma en que las escribas.",
    languageLabel: "Idioma",
    english: "English",
    spanish: "Español",
    saved: "Guardado.",
    saveFailed: (msg) => `No se pudo guardar: ${msg}`,
    saving: "Guardando…",
  },
};
