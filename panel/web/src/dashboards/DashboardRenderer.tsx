import type { NoteSummary } from "../api/types";
import { WIDGET_REGISTRY } from "./widgets/registry";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { useT } from "../i18n/store";

interface RawWidget {
  kind?: unknown;
  title?: unknown;
  params?: unknown;
}

/**
 * A note is a dashboard purely structurally: its frontmatter has a
 * `widgets` array (plan §5.1). This must not key off any other field —
 * the reference vault uses Spanish (`tipo`, `estado`), other vaults use
 * whatever taxonomy they want or none, and detection has to work the
 * same regardless. Widget `params` reference whatever fields a given
 * vault actually uses; this file never does.
 */
export function isDashboardFrontmatter(frontmatter: unknown): boolean {
  if (!frontmatter || typeof frontmatter !== "object") return false;
  return Array.isArray((frontmatter as Record<string, unknown>).widgets);
}

export function DashboardRenderer({
  widgets,
  notes,
}: {
  widgets: unknown;
  notes: NoteSummary[];
}) {
  const t = useT();
  const list = Array.isArray(widgets) ? (widgets as RawWidget[]) : [];

  if (list.length === 0) {
    return <p className="muted">{t.dashboard.noWidgets}</p>;
  }

  return (
    <div className="dashboard-grid">
      {list.map((w, i) => {
        const kind = typeof w.kind === "string" ? w.kind : undefined;
        const title = typeof w.title === "string" ? w.title : t.dashboard.untitledWidget;
        const Widget = kind ? WIDGET_REGISTRY[kind] : undefined;
        return (
          <div className="dashboard-widget" key={`${kind ?? "unknown"}-${i}`}>
            <h3 className="dashboard-widget-title">{title}</h3>
            <WidgetErrorBoundary>
              {Widget ? (
                <Widget params={w.params ?? {}} notes={notes} />
              ) : (
                <p className="widget-error">{t.dashboard.unknownWidgetKind(kind ?? "(missing)")}</p>
              )}
            </WidgetErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
