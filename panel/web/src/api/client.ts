/**
 * Same-origin fetch wrapper. No base URL configured on purpose — in dev,
 * Vite's proxy (vite.config.ts) forwards /api/* to the backend; in
 * production the built dist/ is served by the same Fastify process that
 * serves the API (panel/README.md, frontend-implementation-plan.md §1),
 * so relative /api/* paths resolve correctly in both cases.
 */
export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ? `: ${body.error}` : "";
    } catch {
      // response wasn't JSON — fall through with no detail
    }
    throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status})${detail}`);
  }
  return res.json() as Promise<T>;
}
