/**
 * `GET /api/note` returns the raw file (`content`), frontmatter block
 * included — the parsed `frontmatter` object is a separate field. Strip
 * the leading `---\n...\n---` block before handing the body to the
 * markdown renderer; the parsed object is rendered separately.
 */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function stripFrontmatter(raw: string): string {
  return raw.replace(FRONTMATTER_RE, "");
}
