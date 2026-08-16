import { Link } from "react-router-dom";
import { useNotes } from "../api/queries";
import { useT } from "../i18n/store";
import { interpolate } from "../i18n/interpolate";

export function Welcome() {
  const { data } = useNotes();
  const t = useT();
  return (
    <div className="welcome">
      <h1>{t.welcome.title}</h1>
      <p className="muted">
        {data ? t.welcome.notesIndexed(data.length) : t.common.loading}{" "}
        {interpolate(t.welcome.pickNoteTemplate, {
          graph: <Link to="/vault/graph">{t.welcome.graphLink}</Link>,
          health: <Link to="/vault/health">{t.welcome.healthLink}</Link>,
        })}
      </p>
    </div>
  );
}
