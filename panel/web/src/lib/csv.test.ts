import { describe, expect, it } from "vitest";
import { delimiterFor, parseDelimited } from "./csv";

const csv = (text: string, maxRows = 100) => parseDelimited(text, ",", maxRows);

describe("delimiterFor", () => {
  it("takes the extension at its word instead of sniffing", () => {
    expect(delimiterFor("tsv")).toBe("\t");
    expect(delimiterFor("csv")).toBe(",");
  });
});

describe("parseDelimited", () => {
  it("splits a plain file into a header and rows", () => {
    const t = csv("name,qty\nbolt,3\nnut,7\n");
    expect(t.header).toEqual(["name", "qty"]);
    expect(t.rows).toEqual([
      ["bolt", "3"],
      ["nut", "7"],
    ]);
    expect(t.totalRows).toBe(2);
    expect(t.columns).toBe(2);
  });

  it("handles quotes, doubled quotes, embedded delimiters and embedded newlines", () => {
    const t = csv('a,b\n"has, comma","says ""hi"""\n"two\nlines",x\n');
    expect(t.rows).toEqual([
      ["has, comma", 'says "hi"'],
      ["two\nlines", "x"],
    ]);
  });

  it("reads CRLF the same as LF and doesn't invent a trailing row", () => {
    const t = csv("a,b\r\n1,2\r\n");
    expect(t.rows).toEqual([["1", "2"]]);
    expect(t.totalRows).toBe(1);
  });

  it("tolerates a missing final newline", () => {
    expect(csv("a,b\n1,2").rows).toEqual([["1", "2"]]);
  });

  it("strips a BOM so it doesn't glue itself to the first header", () => {
    // Every round-trip through Excel puts one there.
    expect(csv("﻿name,qty\nbolt,1\n").header).toEqual(["name", "qty"]);
  });

  it("keeps ragged rows and reports the widest one", () => {
    const t = csv("a,b,c\n1\n2,3,4,5\n");
    expect(t.columns).toBe(4);
    expect(t.rows).toEqual([["1"], ["2", "3", "4", "5"]]);
  });

  it("caps the rows it keeps but still counts the ones it dropped", () => {
    const body = Array.from({ length: 500 }, (_, i) => `${i},x`).join("\n");
    const t = csv(`a,b\n${body}\n`, 10);
    expect(t.rows).toHaveLength(10);
    expect(t.totalRows).toBe(500);
  });

  it("does not fall over on an empty file or a header-only file", () => {
    expect(csv("")).toEqual({ header: [], rows: [], totalRows: 0, columns: 0 });
    const t = csv("a,b\n");
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows).toEqual([]);
    expect(t.totalRows).toBe(0);
  });

  it("reads tab-separated data with the same rules", () => {
    const t = parseDelimited("a\tb\n1\t2\n", "\t", 10);
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows).toEqual([["1", "2"]]);
  });
});
