import type { Link, Parent, PhrasingContent, Root, Text } from "mdast";

/**
 * Custom remark plugin for `[[target]]` / `[[target|alias]]` wiki-links —
 * frontend-implementation-plan.md §6.4. Deliberately not the
 * `remark-wiki-link` npm package: that package resolves links itself
 * (permalink generation from a page list), which would duplicate and can
 * diverge from the server's `resolveLink` in vault.ts (bare slug,
 * root-relative, note-relative `../`, escaped-pipe handling). This plugin
 * only *parses* `[[...]]` into a standard mdast `link` node; resolution
 * happens client-side in <Markdown> using the notes list (§6.5).
 *
 * Target extraction mirrors the server's WIKILINK regex in vault.ts
 * exactly (same char class, same trailing-backslash trim for the
 * escaped-pipe-in-tables case) so a link this plugin marks "broken" is
 * broken by the same definition GET /api/health/vault uses.
 */
const WIKILINK_RE = /\[\[([^\]|#]+)(?:([|#])([^\]]*))?\]\]/g;

function cleanTarget(raw: string): string {
  return raw.trim().replace(/\\+$/, "").trim();
}

/** Marker prefix so <Markdown>'s `a` renderer can tell wiki-links apart
 *  from regular markdown links without a second mdast node type. */
export const WIKILINK_HREF_PREFIX = "wikilink:";

function splitText(value: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(value))) {
    const [whole, rawTarget, delim, rest] = match;
    if (match.index > last) {
      out.push({ type: "text", value: value.slice(last, match.index) } satisfies Text);
    }
    const target = cleanTarget(rawTarget ?? "");
    const alias = delim === "|" ? (rest ?? "").trim() : "";
    const label = alias || target;
    if (target) {
      const link: Link = {
        type: "link",
        url: WIKILINK_HREF_PREFIX + encodeURIComponent(target),
        children: [{ type: "text", value: label }],
      };
      out.push(link);
    } else {
      out.push({ type: "text", value: whole } satisfies Text);
    }
    last = match.index + whole.length;
  }
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) } satisfies Text);
  }
  return out;
}

function visit(node: Parent): void {
  if (!Array.isArray(node.children)) return;
  const next: PhrasingContent[] = [];
  let changed = false;
  for (const child of node.children as PhrasingContent[]) {
    if (child.type === "text" && child.value.includes("[[")) {
      const parts = splitText(child.value);
      if (parts.length !== 1 || parts[0] !== child) changed = true;
      next.push(...parts);
    } else {
      if ("children" in child) visit(child as unknown as Parent);
      next.push(child);
    }
  }
  if (changed) (node as Parent).children = next as Parent["children"];
}

export default function remarkWikiLink() {
  return (tree: Root) => {
    visit(tree as unknown as Parent);
  };
}
