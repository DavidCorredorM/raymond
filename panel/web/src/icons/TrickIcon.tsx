import { Icon, type IconName } from "./Icon";

/**
 * `trick.yaml`'s `icono:` field, mapped to one of the shared SVG icons —
 * never rendered as literal text. The server validates it only as
 * `z.string().optional()` (tricks.ts), so it is untrusted content the
 * moment it reaches the browser: a manifest authored before this change,
 * or one an agent writes without reading the updated skill, may still
 * hand this component an emoji character. Falling back to "tricks"
 * (never echoing the raw string) is what keeps that from becoming an
 * emoji rendered in the panel regardless of what the vault contains —
 * the owner's rule is about what the UI shows, not just what ships.
 *
 * The vocabulary matches what `trick-creator`'s SKILL.md now tells an
 * authoring agent to pick from. Unknown values are the expected case for
 * a custom trick, not an error — the fallback icon is a normal, supported
 * outcome, not a degraded one.
 */
const TRICK_ICON_NAMES: Record<string, IconName> = {
  checklist: "checklist",
  play: "play",
  form: "form",
  chart: "chart",
  health: "health",
  tricks: "tricks",
};

export function trickIconName(icono: string | undefined): IconName {
  if (!icono) return "tricks";
  return TRICK_ICON_NAMES[icono.trim().toLowerCase()] ?? "tricks";
}

export function TrickIcon({ icono, size }: { icono: string | undefined; size?: number }) {
  return <Icon name={trickIconName(icono)} size={size} />;
}
