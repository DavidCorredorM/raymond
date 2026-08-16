import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useNote, useNotes } from "../api/queries";
import { Markdown } from "../markdown/Markdown";
import { stripFrontmatter } from "../lib/frontmatter";
import { buildSlugIndex } from "../lib/slugIndex";
import { HOME_DASHBOARD_PATH } from "../lib/config";
import { DashboardRenderer, isDashboardFrontmatter } from "../dashboards/DashboardRenderer";
import { useT } from "../i18n/store";
import { interpolate } from "../i18n/interpolate";

/**
 * Reads whatever dashboard file is configured as home — today a fixed
 * path (`HOME_DASHBOARD_PATH`), a normal vault note like any other. No
 * special-casing beyond that: if it has a `widgets:` array it renders as
 * a dashboard, exactly like any note under /vault/note/* would.
 */
export function HomeRoute() {
  const noteQuery = useNote(HOME_DASHBOARD_PATH);
  const notesQuery = useNotes();
  const slugIndex = useMemo(() => buildSlugIndex(notesQuery.data ?? []), [notesQuery.data]);
  const t = useT();

  if (noteQuery.isLoading) {
    return <p className="muted page-scroll">{t.common.loading}</p>;
  }

  if (noteQuery.isError || !noteQuery.data) {
    return (
      <div className="home-empty page-scroll">
        <h1>Raymond</h1>
        <p>
          {interpolate(t.home.noDashboardTemplate, {
            path: <code>{HOME_DASHBOARD_PATH}</code>,
            widgetsField: <code>widgets:</code>,
            specPath: <code>panel/docs/frontend-implementation-plan.md</code>,
            vaultLink: <Link to="/vault">{t.home.vaultLinkText}</Link>,
          })}
        </p>
      </div>
    );
  }

  const note = noteQuery.data;
  const isDashboard = isDashboardFrontmatter(note.frontmatter);

  return (
    <div className="home-route page-scroll">
      <Markdown content={stripFrontmatter(note.content)} slugIndex={slugIndex} />
      {isDashboard ? (
        <DashboardRenderer widgets={note.frontmatter.widgets} notes={notesQuery.data ?? []} />
      ) : (
        <p className="muted">
          {interpolate(t.home.noWidgetsTemplate, {
            path: <code>{HOME_DASHBOARD_PATH}</code>,
            widgetsField: <code>widgets:</code>,
          })}
        </p>
      )}
    </div>
  );
}
