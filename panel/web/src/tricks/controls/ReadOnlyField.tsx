import type { TrickCampo } from "../../api/types";

/**
 * `texto`/`checkbox`/`fecha`/`select` render read-only for now — there's
 * no single note context in a trick-detail view to bind a field to
 * sensibly yet (that needs the `lista` row this field would belong to,
 * or a selected item, neither built in this pass). Shipping this as a
 * clearly-labeled preview rather than blocking `boton`/`correr_script`
 * and `lista`, which are what's needed today (task brief).
 */
export function ReadOnlyField({ campo }: { campo: TrickCampo }) {
  const label = campo.etiqueta ?? campo.campo ?? "(field)";
  return (
    <div className="trick-field-readonly">
      <span className="trick-field-label">{label}</span>
      <span className="muted"> — {campo.control ?? "unknown"} control, read-only preview</span>
    </div>
  );
}
