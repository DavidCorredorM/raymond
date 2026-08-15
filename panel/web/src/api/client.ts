/**
 * Same-origin fetch wrapper. No base URL configured on purpose — in dev,
 * Vite's proxy (vite.config.ts) forwards /api/* to the backend; in
 * production the built dist/ is served by the same Fastify process that
 * serves the API (panel/README.md, frontend-implementation-plan.md §1),
 * so relative /api/* paths resolve correctly in both cases.
 */
import type { AttachmentUploadResult } from "./types";

/**
 * Carries the HTTP status so a caller can branch on it. Upload needs this:
 * a 409 from POST /api/attachment is a question for the user ("replace the
 * existing file?"), a 413 is a size-limit message, and everything else is a
 * plain failure — indistinguishable if the status is only ever formatted
 * into a string (roadmap #9). Still an `Error`, so the existing
 * `(err as Error).message` call sites are unaffected.
 */
export class ApiError extends Error {
  /** 0 when the request never got a response (offline, server down). */
  readonly status: number;
  /** The server's own `error` field, when it sent JSON. */
  readonly serverMessage?: string;

  constructor(message: string, status: number, serverMessage?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let serverMessage: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) serverMessage = String(body.error);
    } catch {
      // response wasn't JSON — fall through with no detail
    }
    const detail = serverMessage ? `: ${serverMessage}` : "";
    throw new ApiError(
      `${init?.method ?? "GET"} ${url} failed (${res.status})${detail}`,
      res.status,
      serverMessage,
    );
  }
  return res.json() as Promise<T>;
}

export interface UploadRequest {
  /** Vault-relative destination folder; "" is the vault root. */
  folder: string;
  file: File;
  /** Only ever true after the user answered the 409 conflict question. */
  overwrite?: boolean;
  /** 0..1, fires only while the browser reports a computable length. */
  onProgress?: (fraction: number) => void;
}

/**
 * XHR, not fetch, for one reason: `fetch` exposes no upload progress, and a
 * 25 MB file over a tailnet is slow enough that a bare spinner is a bad
 * answer (roadmap #9 asks for progress). Everything else here goes through
 * fetchJSON.
 */
export function uploadAttachment({
  folder,
  file,
  overwrite,
  onProgress,
}: UploadRequest): Promise<AttachmentUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Fields before the file part: a streaming multipart parser sees parts
    // in wire order, so the destination has to be readable before the body
    // it applies to.
    form.append("folder", folder);
    if (overwrite) form.append("overwrite", "true");
    form.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachment");
    xhr.responseType = "text";
    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      });
    }
    xhr.addEventListener("load", () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText) as unknown;
      } catch {
        body = undefined;
      }
      const serverMessage =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : undefined;
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body as AttachmentUploadResult);
        return;
      }
      const detail = serverMessage ? `: ${serverMessage}` : "";
      reject(
        new ApiError(
          `POST /api/attachment failed (${xhr.status})${detail}`,
          xhr.status,
          serverMessage,
        ),
      );
    });
    xhr.addEventListener("error", () =>
      reject(new ApiError("POST /api/attachment failed (no response)", 0)),
    );
    xhr.addEventListener("abort", () =>
      reject(new ApiError("POST /api/attachment was cancelled", 0)),
    );
    xhr.send(form);
  });
}
