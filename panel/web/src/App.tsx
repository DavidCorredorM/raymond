import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { VaultShell } from "./routes/VaultShell";
import { Welcome } from "./routes/Welcome";
import { NoteRoute } from "./routes/NoteRoute";
import { HealthRoute } from "./routes/HealthRoute";

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
          <Route path="/" element={<VaultShell />}>
            <Route index element={<Welcome />} />
            <Route path="note/*" element={<NoteRoute />} />
            <Route path="health" element={<HealthRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
