import { Fragment, type ReactNode } from "react";

/**
 * Splits a translated template on `{token}` markers and interleaves the
 * caller's ReactNodes (a `<Link>`, a `<code>`) in their place.
 *
 * Exists because several messages in this app embed a link or a code span
 * mid-sentence ("start browsing the {vaultLink}"). Chopping a sentence
 * like that into three separate translation keys forces a translator to
 * reassemble them in the source's word order, which Spanish does not
 * always share with English — keeping the whole sentence as one template
 * string per language, with the embedded elements as named holes, is what
 * lets `es.ts` reorder a clause without co-ordinating with the caller.
 */
export function interpolate(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  const tokenPattern = /\{(\w+)\}/g;
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(template))) {
    if (match.index > lastIndex) out.push(template.slice(lastIndex, match.index));
    const token = match[1];
    out.push(
      <Fragment key={key++}>{token in parts ? parts[token] : match[0]}</Fragment>,
    );
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < template.length) out.push(template.slice(lastIndex));
  return out;
}
