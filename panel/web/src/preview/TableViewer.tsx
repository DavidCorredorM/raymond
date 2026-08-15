import { useMemo, useState } from "react";
import { NoPreview } from "./NoPreview";
import { PreviewFrame } from "./PreviewFrame";
import { delimiterFor, parseDelimited } from "../lib/csv";
import { TABLE_PREVIEW_MAX_ROWS } from "../lib/preview";
import { TooLargeError, useAttachmentText } from "./useAttachmentText";

/**
 * CSV and TSV as an actual table. Lazy-loaded, but kept out of TextViewer's
 * chunk on purpose: this needs a ~90-line parser and CodeMirror's ~600 kB
 * has nothing to do with reading a spreadsheet export. The raw view here is
 * a `<pre>` for the same reason — reaching for the syntax highlighter to
 * show comma-separated numbers would undo the split.
 *
 * The row cap is the size guard for this kind. A skill exporting 200k rows
 * is a real thing (roadmap #9's whole premise is scripts writing files into
 * the vault); 200k `<tr>` is a locked tab, so the header says what fraction
 * is on screen and the download is next to it.
 */
export function TableViewer({
  path,
  name,
  ext,
  size,
  downloadHref,
}: {
  path: string;
  name: string;
  ext: string;
  size?: number;
  downloadHref: string;
}) {
  const { data, isLoading, isError, error } = useAttachmentText(path);
  const [raw, setRaw] = useState(false);
  const table = useMemo(
    () => (data ? parseDelimited(data, delimiterFor(ext), TABLE_PREVIEW_MAX_ROWS) : null),
    [data, ext],
  );

  if (isLoading) return <p className="muted preview-loading">Reading {name}…</p>;
  if (isError) {
    const err = error as Error;
    return (
      <NoPreview
        name={name}
        size={size}
        downloadHref={downloadHref}
        reason={
          err instanceof TooLargeError
            ? `Too large to show as a table — ${err.message}.`
            : `Couldn't read this file: ${err.message}.`
        }
      />
    );
  }
  if (!table) {
    return (
      <NoPreview
        name={name}
        size={size}
        downloadHref={downloadHref}
        reason="This file is empty."
      />
    );
  }

  const truncated = table.totalRows > table.rows.length;
  const status = truncated
    ? `${table.rows.length.toLocaleString()} of ${table.totalRows.toLocaleString()} rows · ${table.columns} columns`
    : `${table.totalRows.toLocaleString()} row${table.totalRows === 1 ? "" : "s"} · ${table.columns} columns`;

  return (
    <PreviewFrame
      flush
      status={status}
      actions={
        <>
          <button
            type="button"
            className="preview-button"
            onClick={() => setRaw((v) => !v)}
            aria-pressed={raw}
          >
            {raw ? "Table" : "Raw text"}
          </button>
          <a className="preview-button" href={downloadHref}>
            Download
          </a>
        </>
      }
    >
      {raw ? (
        <pre className="preview-raw">{data}</pre>
      ) : (
        <div className="preview-table-scroll">
          <table className="preview-table">
            <thead>
              <tr>
                {/* A row number column, because the point of scrolling a
                    10k-row export is usually knowing where you are in it. */}
                <th className="preview-table-rownum" scope="col">
                  #
                </th>
                {padTo(table.header, table.columns).map((cell, i) => (
                  <th key={i} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  <td className="preview-table-rownum">{r + 1}</td>
                  {padTo(row, table.columns).map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {truncated && (
            <p className="muted preview-table-note">
              Showing the first {table.rows.length.toLocaleString()} of{" "}
              {table.totalRows.toLocaleString()} rows. Download the file to see all of it.
            </p>
          )}
        </div>
      )}
    </PreviewFrame>
  );
}

/** A ragged row still has to line up under the right headers. */
function padTo(row: string[], columns: number): string[] {
  if (row.length >= columns) return row;
  return [...row, ...Array<string>(columns - row.length).fill("")];
}
