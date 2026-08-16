/**
 * One icon set, drawn once, one weight — the owner's explicit ask: "no
 * emojis anywhere in the UI... replace with a coherent icon approach —
 * inline SVG, drawn once, consistent weight."
 *
 * Every icon shares the same contract: 20x20 viewBox, `stroke="currentColor"`,
 * `fill="none"`, 1.6px stroke, round joins/caps. That means a colour
 * change is one CSS rule (`color: ...`) and every glyph in the app reads
 * as one family instead of a mix of emoji fonts (which render
 * differently per OS — the opposite of "consistent weight" — and are
 * exactly what the owner called "really bad").
 *
 * `TrickIcon` (tricks/TrickIcon.tsx) is the one place a *vault-authored*
 * string (`trick.yaml`'s `icono:` field) selects one of these — never
 * rendered as literal text, so an old manifest that still has an emoji
 * in it degrades to the generic icon instead of an emoji leaking back
 * into the UI through content nobody reviewing this file wrote.
 */
import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "chevron-right"
  | "vault"
  | "graph"
  | "health"
  | "tricks"
  | "external-link"
  | "grip"
  | "checklist"
  | "play"
  | "form"
  | "chart"
  | "upload"
  | "warning"
  | "close"
  | "edit"
  | "save"
  | "search"
  | "rename";

const PATHS: Record<IconName, ReactElement> = {
  "chevron-right": <path d="M7.5 4.5 13 10l-5.5 5.5" />,
  vault: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M7 4v-.5A1.5 1.5 0 0 1 8.5 2h3A1.5 1.5 0 0 1 13 3.5V4" />
    </>
  ),
  graph: (
    <>
      <circle cx="5" cy="5" r="2" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="15" r="2" />
      <path d="M6.6 6.2 8 13.3M6.8 4.5l6.6 1.1M10.6 14 13.4 7.6" />
    </>
  ),
  health: (
    <>
      <path d="M10 17s-6.2-3.8-6.2-8.4A3.6 3.6 0 0 1 10 6.1a3.6 3.6 0 0 1 6.2 2.5C16.2 13.2 10 17 10 17Z" />
      <path d="M6 9.5h1.6l1-2 1.6 4 1-2H15" />
    </>
  ),
  tricks: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </>
  ),
  "external-link": (
    <>
      <path d="M8 5H4.8A1.8 1.8 0 0 0 3 6.8v8.4A1.8 1.8 0 0 0 4.8 17h8.4A1.8 1.8 0 0 0 15 15.2V12" />
      <path d="M11 3h6v6M17 3l-8 8" />
    </>
  ),
  grip: (
    <>
      <circle cx="7" cy="5" r="1" />
      <circle cx="13" cy="5" r="1" />
      <circle cx="7" cy="10" r="1" />
      <circle cx="13" cy="10" r="1" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="13" cy="15" r="1" />
    </>
  ),
  checklist: (
    <>
      <path d="M4 5.5 5.5 7 8 4.2M4 10.5 5.5 12 8 9.2M4 15.5 5.5 17 8 14.2" />
      <path d="M11 5h5.5M11 10h5.5M11 15h5.5" />
    </>
  ),
  play: <path d="M6.5 4.3v11.4c0 .8.9 1.3 1.6.9l9-5.7a1 1 0 0 0 0-1.7l-9-5.7c-.7-.4-1.6.1-1.6.8Z" />,
  form: (
    <>
      <path d="M11 3.5H6A1.5 1.5 0 0 0 4.5 5v10A1.5 1.5 0 0 0 6 16.5h8A1.5 1.5 0 0 0 15.5 15V8" />
      <path d="M13.5 3.3a1.3 1.3 0 0 1 1.8 1.8l-5 5-2.3.5.5-2.3Z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 16.5h12" />
      <rect x="5.5" y="10.5" width="2.4" height="6" />
      <rect x="9.3" y="7" width="2.4" height="9.5" />
      <rect x="13.1" y="4.5" width="2.4" height="12" />
    </>
  ),
  upload: (
    <>
      <path d="M10 13.5V4.5M6.5 8 10 4.5 13.5 8" />
      <path d="M4.5 14.5v1A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3.6 17.3 16A1 1 0 0 1 16.4 17.5H3.6A1 1 0 0 1 2.7 16L10 3.6Z" />
      <path d="M10 8v3.4M10 14v.1" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5 5 15" />,
  edit: (
    <>
      <path d="M13.5 3.3a1.3 1.3 0 0 1 1.8 1.8l-8.6 8.6-3 .8.8-3Z" />
    </>
  ),
  save: (
    <>
      <path d="M4.5 3.5h9L16.5 6.5v10a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" />
      <path d="M7 3.5v4h6v-4M7 17v-5h6v5" />
    </>
  ),
  search: (
    <>
      <circle cx="8.7" cy="8.7" r="4.7" />
      <path d="M15.5 15.5 12 12" />
    </>
  ),
  rename: (
    <>
      <path d="M4 15.5h12M4 15.5V13l7.5-7.5 2.5 2.5L6.5 15.5H4Z" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
