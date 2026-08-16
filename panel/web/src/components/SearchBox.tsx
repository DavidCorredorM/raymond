import { useT } from "../i18n/store";

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <input
      type="search"
      className="search-box"
      placeholder={t.searchBox.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t.searchBox.ariaLabel}
    />
  );
}

/** Client-side filter over the already-fetched notes list (plan §6 — no
 *  new endpoint). Matches title, slug, or path, case-insensitive. */
export function filterNotes<T extends { title: string; slug: string; path: string }>(
  notes: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.slug.toLowerCase().includes(q) ||
      n.path.toLowerCase().includes(q),
  );
}

/** Same filter for attachments, which have a path and nothing else to match. */
export function filterAttachments<T extends { path: string }>(files: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.path.toLowerCase().includes(q));
}
