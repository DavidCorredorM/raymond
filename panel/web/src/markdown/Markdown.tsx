import { Link } from "react-router-dom";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkWikiLink, { WIKILINK_HREF_PREFIX } from "./remarkWikiLink";
import { resolveWikiTarget, type SlugIndex } from "../lib/slugIndex";
import { noteHref } from "../lib/notePath";

const remarkPlugins = [remarkGfm, remarkWikiLink];

/**
 * react-markdown's default urlTransform strips any URL whose scheme isn't
 * on its safe-protocol allowlist (http/https/mailto/etc) — our internal
 * `wikilink:` scheme (remarkWikiLink.ts) isn't on it, so unresolved and
 * resolved links alike would come through with `href=""` and render as
 * inert, resolution-blind anchors. Pass those through untouched; defer to
 * the default sanitizer for everything else.
 */
function urlTransform(url: string): string {
  if (url.startsWith(WIKILINK_HREF_PREFIX)) return url;
  return defaultUrlTransform(url);
}

export function Markdown({ content, slugIndex }: { content: string; slugIndex: SlugIndex }) {
  const components: Components = {
    a({ href, children, ...props }) {
      if (href?.startsWith(WIKILINK_HREF_PREFIX)) {
        const target = decodeURIComponent(href.slice(WIKILINK_HREF_PREFIX.length));
        const resolved = resolveWikiTarget(target, slugIndex);
        if (resolved) {
          return (
            <Link to={noteHref(resolved)} className="wikilink">
              {children}
            </Link>
          );
        }
        return (
          <span className="wikilink wikilink-broken" title={`Broken link: [[${target}]]`}>
            {children}
          </span>
        );
      }
      const external = /^[a-z]+:\/\//i.test(href ?? "");
      return (
        <a href={href} {...props} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {children}
        </a>
      );
    },
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components} urlTransform={urlTransform}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
