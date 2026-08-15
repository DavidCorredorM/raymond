import { useNotes } from "../api/queries";

// `.claude/tricks/<name>/SKILL.md` is already indexed by GET /api/notes
// (isSystem: true, same as any .claude/ path) — no backend change needed
// to know which trick names exist, only to render them, which is
// explicitly out of scope for this pass (tricks-spec.md, plan §11.4).
const TRICK_SKILL_RE = /^\.claude\/tricks\/([^/]+)\/SKILL\.md$/;

export function TricksRoute() {
  const { data: notes, isLoading } = useNotes();

  if (isLoading) {
    return <p className="muted page-scroll">Loading…</p>;
  }

  const trickNames = new Set<string>();
  for (const n of notes ?? []) {
    const m = TRICK_SKILL_RE.exec(n.path);
    if (m) trickNames.add(m[1]!);
  }

  if (trickNames.size === 0) {
    return (
      <div className="tricks-empty page-scroll">
        <h1>Tricks</h1>
        <p>
          A trick is a small interactive mini-app — a todo list, a habit
          tracker, a simple form — backed by a Claude Code skill. This vault
          doesn&apos;t have any yet.
        </p>
        <p>
          Tricks aren&apos;t built by hand: open Claude Code in this vault
          and describe what you want tracked — &ldquo;make me a reading
          list&rdquo;, &ldquo;I want a habit tracker&rdquo; — and the{" "}
          <code>trick-creator</code> skill writes the folder for you.
          Nothing to install, no rebuild.
        </p>
      </div>
    );
  }

  return (
    <div className="tricks-route page-scroll">
      <h1>Tricks</h1>
      <p className="muted">
        {trickNames.size} trick{trickNames.size === 1 ? "" : "s"} found in this vault. Rendering
        them isn&apos;t built yet — this pass only ships the route and the empty state.
      </p>
      <ul>
        {[...trickNames].sort().map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
