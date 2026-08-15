import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./routes/AppShell";
import { VaultShell } from "./routes/VaultShell";
import { Welcome } from "./routes/Welcome";
import { NoteRoute } from "./routes/NoteRoute";
import { HealthRoute } from "./routes/HealthRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { TricksRoute } from "./routes/TricksRoute";

// react-force-graph-2d pulls in d3-force and pushes the main bundle past
// the 500kB warning threshold on its own; it's also only needed on one
// route that isn't the default (Home). Code-split it rather than paying
// that weight on every page load.
const GraphRoute = lazy(() => import("./routes/GraphRoute").then((m) => ({ default: m.GraphRoute })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

/**
 * A data router (`createBrowserRouter`/`RouterProvider`), not the plain
 * declarative `<BrowserRouter><Routes>`. The unsaved-changes navigation
 * guard (editor/useUnsavedChangesGuard.ts) needs `useBlocker`, which is a
 * no-op outside a data router — everything else about the route tree below
 * is unchanged from the previous declarative version.
 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      {
        path: "vault",
        element: <VaultShell />,
        children: [
          { index: true, element: <Welcome /> },
          { path: "note/*", element: <NoteRoute /> },
          {
            path: "graph",
            element: (
              <Suspense fallback={<p className="muted">Loading graph…</p>}>
                <GraphRoute />
              </Suspense>
            ),
          },
          { path: "health", element: <HealthRoute /> },
        ],
      },
      { path: "tricks", element: <TricksRoute /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
