import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<HomeRoute />} />
            <Route path="vault" element={<VaultShell />}>
              <Route index element={<Welcome />} />
              <Route path="note/*" element={<NoteRoute />} />
              <Route
                path="graph"
                element={
                  <Suspense fallback={<p className="muted">Loading graph…</p>}>
                    <GraphRoute />
                  </Suspense>
                }
              />
              <Route path="health" element={<HealthRoute />} />
            </Route>
            <Route path="tricks" element={<TricksRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
