import { useState } from "react";
import { useRunTrickAction } from "../../api/queries";
import type { TrickRunResult } from "../../api/types";

/**
 * The `boton` + `correr_script` primitive — the part of the trick
 * renderer that actually matters today (task brief). Clicking runs
 * `POST /api/tricks/:name/run` with only `{ actionIndex }`; what the
 * action does (`ruta`/`args`) is never sent from here — the server reads
 * that itself from its own copy of `trick.yaml` (tricks-spec.md's
 * trust-boundary section, server/src/tricks.ts).
 */
export function ActionButton({
  trickName,
  actionIndex,
  label,
}: {
  trickName: string;
  actionIndex: number;
  label: string;
}) {
  const run = useRunTrickAction(trickName);
  const [result, setResult] = useState<TrickRunResult | null>(null);

  async function handleClick() {
    setResult(null);
    try {
      const res = await run.mutateAsync(actionIndex);
      setResult(res);
    } catch {
      // run.isError / run.error already reflect the failure below.
    }
  }

  const status = !result
    ? null
    : result.timedOut
      ? "timeout"
      : result.ok
        ? "ok"
        : "fail";

  return (
    <div className="trick-action">
      <button type="button" className="save-button" onClick={handleClick} disabled={run.isPending}>
        {run.isPending ? "Running…" : label}
      </button>

      {run.isError && (
        <p className="note-error">Request failed: {(run.error as Error).message}</p>
      )}

      {result && (
        <div className={`trick-run-result trick-run-${status}`}>
          <p className="trick-run-status">
            {status === "timeout" && "Timed out — killed after the server's timeout"}
            {status === "ok" && "Success"}
            {status === "fail" && `Failed (exit code ${result.exitCode ?? "unknown"})`}
          </p>
          {result.stdout && (
            <>
              <p className="muted trick-run-label">stdout</p>
              <pre className="trick-run-output">{result.stdout}</pre>
            </>
          )}
          {result.stderr && (
            <>
              <p className="muted trick-run-label">stderr</p>
              <pre className="trick-run-output trick-run-stderr">{result.stderr}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
