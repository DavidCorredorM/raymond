import type { ComponentType } from "react";
import type { NoteSummary } from "../../api/types";
import { QueryWidget } from "./QueryWidget";
import { CountWidget } from "./CountWidget";
import { VaultHealthWidget } from "./VaultHealthWidget";

export interface WidgetProps {
  params: unknown;
  notes: NoteSummary[];
}

/**
 * Registry pattern from plan §8.2 — a new widget kind is one new file
 * plus one line here, no plugin loader. Only the 3 kinds that need no
 * write capability ship in this pass (plan §11.2); `actions` (§5.5),
 * `stale`, and `backlinks` wait for the editor's write path.
 */
export const WIDGET_REGISTRY: Record<string, ComponentType<WidgetProps>> = {
  query: QueryWidget,
  count: CountWidget,
  "vault-health": VaultHealthWidget,
};
