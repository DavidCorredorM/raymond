import { Link } from "react-router-dom";
import { useNotes } from "../api/queries";

export function Welcome() {
  const { data } = useNotes();
  return (
    <div className="welcome">
      <h1>ben</h1>
      <p className="muted">
        {data ? `${data.length} notes indexed.` : "Loading…"} Pick a note from the tree, or open{" "}
        <Link to="/health">vault health</Link>.
      </p>
    </div>
  );
}
