import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJSON } from "./client";
import type {
  GraphResponse,
  NoteDetail,
  NoteSummary,
  TrickManifest,
  TrickRunResult,
  TrickSummary,
  VaultHealth,
} from "./types";

/**
 * Poll-based freshness (frontend-implementation-plan.md §7 — the server
 * watches the filesystem but pushes nothing to clients yet). 30s on the
 * list/health queries is enough for a single-user tailnet app; the open
 * note also refetches on window focus (TanStack Query default).
 */
const POLL_MS = 30_000;

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: () => fetchJSON<NoteSummary[]>("/api/notes"),
    refetchInterval: POLL_MS,
  });
}

export function useNote(path: string | undefined) {
  return useQuery({
    queryKey: ["note", path],
    queryFn: () => fetchJSON<NoteDetail>(`/api/note?path=${encodeURIComponent(path!)}`),
    enabled: !!path,
  });
}

export function useVaultHealth() {
  return useQuery({
    queryKey: ["vault-health"],
    queryFn: () => fetchJSON<VaultHealth>("/api/health/vault"),
    refetchInterval: POLL_MS,
  });
}

export function useGraph() {
  return useQuery({
    queryKey: ["graph"],
    queryFn: () => fetchJSON<GraphResponse>("/api/graph"),
    refetchInterval: POLL_MS,
  });
}

/**
 * Full-file overwrite through the existing `PUT /api/note` — no
 * partial-write endpoint, no conflict detection (plan §7/§9: autosave and
 * ETags are both explicitly out of scope). Called only from an explicit
 * user action (save button, Cmd/Ctrl+S), never on a timer or on keystroke.
 */
export function useSaveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      fetchJSON<{ ok: true; path: string }>("/api/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["note", variables.path] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useTricks() {
  return useQuery({
    queryKey: ["tricks"],
    queryFn: () => fetchJSON<TrickSummary[]>("/api/tricks"),
    refetchInterval: POLL_MS,
  });
}

export function useTrick(name: string | undefined) {
  return useQuery({
    queryKey: ["trick", name],
    queryFn: () => fetchJSON<TrickManifest>(`/api/tricks/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

/**
 * Runs one pre-declared action by index — the client never sends what
 * the action does (`ruta`/`args`), only which index to run; the server
 * reads those from its own copy of trick.yaml (tricks.ts). Not a
 * TanStack Query cache-invalidating mutation like `useSaveNote`: running
 * a script doesn't change note data the app already caches (unless the
 * script itself writes a vault file, which the filesystem watcher picks
 * up on its own next poll).
 */
export function useRunTrickAction(name: string) {
  return useMutation({
    mutationFn: (actionIndex: number) =>
      fetchJSON<TrickRunResult>(`/api/tricks/${encodeURIComponent(name)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionIndex }),
      }),
  });
}
