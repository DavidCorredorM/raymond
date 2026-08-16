import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./routes/AppShell";
import { VaultShell } from "./routes/VaultShell";
import { Welcome } from "./routes/Welcome";
import { NoteRoute } from "./routes/NoteRoute";
import { AttachmentRoute } from "./routes/AttachmentRoute";
import { HealthRoute } from "./routes/HealthRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { TricksRoute } from "./routes/TricksRoute";
import { TrickDetailRoute } from "./routes/TrickDetailRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { useHealth } from "./api/queries";
import { useI18nStore } from "./i18n/store";

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
          // Separate route from note/*: an attachment has no markdown body,
          // no frontmatter and no backlinks, so it shares nothing with the
          // note view except living in the same tree (roadmap #9).
          { path: "file/*", element: <AttachmentRoute /> },
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
      { path: "tricks/:name", element: <TrickDetailRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);

/**
 * Reads `GET /api/health`'s `language` field into the i18n store
 * (i18n/store.ts) on boot and on every poll — not just once, so a second
 * browser tab open on the same panel picks up a language change made from
 * Settings in the first tab without needing a manual reload. Renders
 * nothing; `useHealth` already drives the rest of the app's "is the
 * server up" signal, this just also listens to one field of it.
 */
function LanguageSync() {
  const { data } = useHealth();
  const setLanguage = useI18nStore((s) => s.setLanguage);
  useEffect(() => {
    if (data?.language) setLanguage(data.language);
  }, [data?.language, setLanguage]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageSync />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
