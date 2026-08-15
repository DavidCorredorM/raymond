import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns before losing an in-progress edit, two ways:
 *
 * - In-app navigation (clicking a note in the tree, a nav link, etc.) via
 *   react-router's data-router `useBlocker`. This only works because
 *   App.tsx uses `createBrowserRouter`/`RouterProvider` instead of the
 *   plain declarative `<BrowserRouter>` — `useBlocker` is a no-op under
 *   the latter.
 * - Browser-level navigation (tab close, refresh, typed URL, closing the
 *   window) via the native `beforeunload` prompt — react-router's blocker
 *   cannot see these, they never touch its history stack.
 *
 * Both read the same `isDirty` flag the save button reads (editorStore,
 * plan §6.2) — never a second source of truth for "has this note changed."
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm("You have unsaved changes to this note. Leave without saving?");
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}
