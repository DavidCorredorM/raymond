import type { NoteSummary, TrickAccion, TrickCampo, TrickManifest } from "../api/types";
import { WidgetErrorBoundary } from "../dashboards/WidgetErrorBoundary";
import { ListaControl } from "./controls/ListaControl";
import { ReadOnlyField } from "./controls/ReadOnlyField";
import { ActionButton } from "./controls/ActionButton";

function isLista(campo: TrickCampo): boolean {
  return campo.control === "lista";
}

function TrickField({ campo, notes }: { campo: TrickCampo; notes: NoteSummary[] }) {
  if (isLista(campo)) return <ListaControl campo={campo} notes={notes} />;
  return <ReadOnlyField campo={campo} />;
}

function TrickAction({
  trickName,
  actionIndex,
  accion,
}: {
  trickName: string;
  actionIndex: number;
  accion: TrickAccion;
}) {
  const label = accion.etiqueta ?? `Action ${actionIndex + 1}`;
  if (accion.control === "boton" && accion.accion?.correr_script) {
    return <ActionButton trickName={trickName} actionIndex={actionIndex} label={label} />;
  }
  // set/crear_nota/archivar and any other control: documented in
  // tricks-spec.md but not required for this pass (task brief) — shown
  // as a clearly-labeled placeholder instead of silently doing nothing.
  return (
    <p className="muted">
      {label}: control &ldquo;{accion.control ?? "?"}&rdquo; isn&apos;t supported by the panel yet.
    </p>
  );
}

/**
 * Renders one trick's `ui.campos` and `acciones` (tricks-spec.md v1
 * primitives). Same structure as `DashboardRenderer`: each field/action
 * gets its own `WidgetErrorBoundary` so one malformed entry degrades to
 * an inline error, not a blown-up page — a trick's manifest is
 * hand/agent-authored YAML with the same "no schema enforcement at
 * write time" property dashboard files have (plan §6.7).
 */
export function TrickRenderer({
  trick,
  notes,
}: {
  trick: TrickManifest;
  notes: NoteSummary[];
}) {
  const campos = trick.ui?.campos ?? [];
  const acciones = trick.acciones ?? [];

  if (campos.length === 0 && acciones.length === 0) {
    return <p className="muted">This trick has no interactive elements yet.</p>;
  }

  return (
    <div className="trick-body">
      {campos.length > 0 && (
        <section className="trick-section">
          {campos.map((campo, i) => (
            <WidgetErrorBoundary key={i}>
              <TrickField campo={campo} notes={notes} />
            </WidgetErrorBoundary>
          ))}
        </section>
      )}

      {acciones.length > 0 && (
        <section className="trick-section trick-actions">
          {acciones.map((accion, i) => (
            <WidgetErrorBoundary key={i}>
              <TrickAction trickName={trick.name} actionIndex={i} accion={accion} />
            </WidgetErrorBoundary>
          ))}
        </section>
      )}
    </div>
  );
}
