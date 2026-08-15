import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A malformed dashboard degrades to one broken tile, not a blank page
 * (frontend-implementation-plan.md §6.7) — dashboard files are hand- or
 * agent-authored YAML with no schema enforcement at write time, so the
 * render path is the only validation layer that exists. Each widget kind
 * parses its own `params` with zod and throws on a bad shape; this
 * boundary is what turns that throw into an inline error instead of
 * taking down every other widget on the page.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <p className="widget-error">Widget failed to render: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}
