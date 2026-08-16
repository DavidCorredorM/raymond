import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJSON, uploadAttachment, type UploadRequest } from "./client";
import type {
  Attachment,
  AttachmentMoveResult,
  AttachmentUploadResult,
  GraphResponse,
  NoteDetail,
  NoteMoveResult,
  NoteSummary,
  TrickManifest,
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

/**
 * Rename or move a note (owner's ask #4) — `POST /api/note/move`, the
 * network face of `_tools/steward.py move`. `panel/server/src/rename.ts`
 * does the actual work (link rewriting, the index-row transplant,
 * rollback on partial failure); this mutation just calls it and
 * invalidates every query whose answer the move could have changed —
 * which, because the whole point is that a move can touch *other*
 * notes' link text, is not just the note that moved.
 */
export function useMoveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      fetchJSON<NoteMoveResult>("/api/note/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      }),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["note", variables.from] });
      queryClient.invalidateQueries({ queryKey: ["note", result.path] });
      for (const path of result.edited) {
        queryClient.invalidateQueries({ queryKey: ["note", path] });
      }
      queryClient.invalidateQueries({ queryKey: ["graph"] });
      queryClient.invalidateQueries({ queryKey: ["vault-health"] });
    },
  });
}

/**
 * The vault's non-`.md` files (roadmap #9). Separate query from `useNotes`
 * on purpose — separate endpoint, separate shape — and merged into one tree
 * client-side (lib/vaultTree.ts). Same poll interval as the notes list: a
 * script writing a report into the vault should show up without a reload,
 * which is the whole point of the feature.
 */
export function useAttachments() {
  return useQuery({
    queryKey: ["attachments"],
    queryFn: () => fetchJSON<Attachment[]>("/api/attachments"),
    refetchInterval: POLL_MS,
  });
}

/**
 * The only write path that puts a file in the vault from the browser. The
 * caller passes the destination folder explicitly — there is no default
 * destination, by design: roadmap #9 decided attachments are filed by what
 * they are, next to the notes they belong to, never into a dump folder.
 *
 * Invalidates the attachment list so the tree shows the new file straight
 * away, and the notes list too, since an uploaded `.md` lands in that index
 * instead (the server decides which one a given file belongs to).
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation<AttachmentUploadResult, Error, UploadRequest>({
    mutationFn: (req) => uploadAttachment(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

/** Rename or move an attachment — `POST /api/attachment/move`. No links to rewrite (roadmap #9: "a [[wiki-link]] to a PDF is not a thing"), so this is just a location change plus the same never-silently-overwrite 409 the upload endpoint uses. */
export function useMoveAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      fetchJSON<AttachmentMoveResult>("/api/attachment/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments"] });
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

/**
 * One trick's manifest — what the host needs to mount it: the frame
 * height and the capability keys that go in the hello message.
 *
 * There is no `useRunTrickAction` any more. It existed for the deleted
 * v1 renderer's `boton` control, which was the only caller of
 * `POST /api/tricks/:name/run` from the browser. A v2 app runs a script
 * by sending `script.run` over its bridge port, where the index must
 * *also* be listed in the manifest's `script.run.acciones` — declaring an
 * action and exposing it to browser code are two separate decisions
 * (spec §7.5). The `/run` endpoint itself stays: it is the
 * `correr_script` boundary's HTTP face for a filesystem author or a cron
 * script, and spec §2.1 counts it as part of the no-auth baseline.
 */
export function useTrick(name: string | undefined) {
  return useQuery({
    queryKey: ["trick", name],
    queryFn: () => fetchJSON<TrickManifest>(`/api/tricks/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}
