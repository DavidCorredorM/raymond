/**
 * A delimited-text reader for the CSV/TSV preview. Hand-written rather than
 * a dependency: the whole grammar is quotes, doubled quotes, and newlines
 * inside quotes, and a parser is a poor reason to add a package to a bundle
 * that already trips Vite's size warning.
 *
 * Follows RFC 4180 where files actually follow it, and is forgiving where
 * they don't — a lone `"` mid-field, a ragged row, a missing final newline
 * and CRLF line endings all parse to something rather than throwing. A
 * preview that renders 99% of a slightly malformed export is worth more than
 * one that refuses it.
 */

export interface ParsedTable {
  /** First row of the file. Treated as a header — see `looksLikeHeader`. */
  header: string[];
  /** Body rows, already capped at the caller's `maxRows`. */
  rows: string[][];
  /** Body rows in the file, before the cap. */
  totalRows: number;
  /** Widest row seen, so a ragged file still renders a rectangular table. */
  columns: number;
}

/** Tab for `.tsv`, comma for everything else. Sniffing is not worth it: the extension is the declaration. */
export function delimiterFor(ext: string): string {
  return ext === "tsv" ? "\t" : ",";
}

/**
 * Scans the whole document once, character by character. `maxRows` caps what
 * is *kept*, not what is read — the row count in the "showing N of M"
 * message has to be true, and counting rows is cheap next to building DOM
 * for them.
 */
export function parseDelimited(text: string, delimiter: string, maxRows: number): ParsedTable {
  // A UTF-8 BOM survives every round-trip through Excel and would otherwise
  // show up glued to the first column's header.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const kept: string[][] = [];
  let rowCount = 0;
  let columns = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    // A trailing newline at end of file is a line terminator, not an empty
    // record; so is a blank line between records in files Excel writes.
    const empty = row.length === 1 && row[0] === "";
    if (!empty) {
      if (row.length > columns) columns = row.length;
      if (kept.length < maxRows + 1) kept.push(row);
      rowCount += 1;
    }
    row = [];
  }

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      // CRLF: the \n does the work. A lone CR (old Mac) also ends the row.
      if (src[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();

  const header = kept.shift() ?? [];
  if (header.length > columns) columns = header.length;
  return {
    header,
    rows: kept.slice(0, maxRows),
    // `rowCount` counted the header too.
    totalRows: Math.max(0, rowCount - 1),
    columns,
  };
}
