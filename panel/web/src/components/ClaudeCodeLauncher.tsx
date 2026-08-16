import { Icon } from "../icons/Icon";

/**
 * Owner's ask #6: "a quick way into Claude Code on the web... the owner
 * suggested a floating one." Opens https://claude.ai/code in a new tab —
 * nothing here talks to the panel's own API, it is exactly the link a
 * human would middle-click, wrapped so it is reachable from any screen
 * in the app without hunting for a menu.
 *
 * "Unobtrusive and make it obvious what it does" (the owner's phrasing):
 * a round button fixed in the corner, distinct from the accent colour
 * used for primary actions elsewhere, with a visible text label rather
 * than an icon-only button a first-time user has to guess at.
 */
export function ClaudeCodeLauncher() {
  return (
    <a
      href="https://claude.ai/code"
      target="_blank"
      rel="noopener noreferrer"
      className="claude-code-launcher"
      title="Open Claude Code in a new tab to start a chat"
    >
      <Icon name="external-link" size={16} />
      <span>Claude Code</span>
    </a>
  );
}
