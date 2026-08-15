import type { NoteSummary } from "../api/types";

/** slug -> note paths carrying that slug (mirrors server VaultIndex.bySlug). */
export type SlugIndex = Map<string, string[]>;

export function buildSlugIndex(notes: NoteSummary[]): SlugIndex {
  const index: SlugIndex = new Map();
  for (const note of notes) {
    const list = index.get(note.slug) ?? [];
    list.push(note.path);
    index.set(note.slug, list);
  }
  return index;
}

/**
 * Client-side bare-slug resolution only — frontend-implementation-plan.md
 * §6.5, option 1. Root-relative and note-relative `../` forms are not
 * resolved here (that's the flagged, not-yet-built `resolvedLinks`
 * backend addition in §6.5 option 2); a bare-slug miss renders as broken,
 * same as it would server-side for anything beyond step 1 of
 * `resolveLink` in vault.ts.
 */
export function resolveWikiTarget(target: string, index: SlugIndex): string | null {
  const clean = target.trim().replace(/\.md$/i, "");
  if (!clean) return null;
  const matches = index.get(clean);
  return matches?.length ? matches[0]! : null;
}
