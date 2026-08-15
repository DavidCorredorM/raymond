import { describe, expect, it } from "vitest";
import {
  isOversizeForPreview,
  parsesClientSide,
  previewKindOf,
  previewLanguageOf,
  TEXT_PREVIEW_LIMIT_BYTES,
} from "./preview";

function kind(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const i = name.lastIndexOf(".");
  const ext = i <= 0 || i === name.length - 1 ? "" : name.slice(i + 1).toLowerCase();
  return previewKindOf(path, ext);
}

describe("previewKindOf", () => {
  it("covers every type the owner asked for by name", () => {
    expect(kind("a/b.pdf")).toBe("pdf");
    expect(kind("a/b.png")).toBe("image");
    expect(kind("a/b.svg")).toBe("image");
    expect(kind("a/b.mp3")).toBe("audio");
    expect(kind("a/b.mp4")).toBe("video");
    expect(kind("report.html")).toBe("html");
  });

  it("routes SVG through the image viewer, not an iframe", () => {
    // Load-bearing, not cosmetic: `<img src=…>` puts an SVG in the spec's
    // secure static mode (no script execution, no external loads), which is
    // what makes rendering uploaded markup safe in an app with no auth
    // (README rule 3). A later edit that "fixes" SVG by framing it has to
    // break this test first.
    expect(kind("logo.svg")).toBe("image");
  });

  it("reads delimited files as tables and everything else textual as text", () => {
    expect(kind("export.csv")).toBe("table");
    expect(kind("export.tsv")).toBe("table");
    expect(kind("run.log")).toBe("text");
    expect(kind("data.json")).toBe("text");
    expect(kind("conf.yaml")).toBe("text");
    expect(kind("script.py")).toBe("text");
  });

  it("knows the extensionless files a vault's plumbing actually contains", () => {
    expect(kind(".claude/Dockerfile")).toBe("text");
    expect(kind("skills/.gitignore")).toBe("text");
  });

  it("has no preview for office formats or archives", () => {
    // Not an oversight — see the NO_READER table in AttachmentPreview.tsx
    // for why xlsx in particular is download-only.
    expect(kind("cierre.xlsx")).toBe("none");
    expect(kind("acta.docx")).toBe("none");
    expect(kind("deck.pptx")).toBe("none");
    expect(kind("bundle.zip")).toBe("none");
    expect(kind("firmware.bin")).toBe("none");
  });
});

describe("size guard", () => {
  it("guards only the kinds that are read into the tab", () => {
    expect(parsesClientSide("text")).toBe(true);
    expect(parsesClientSide("table")).toBe(true);
    // Streamed by the browser with ranged requests — size is not our problem.
    expect(parsesClientSide("video")).toBe(false);
    expect(parsesClientSide("pdf")).toBe(false);
    expect(parsesClientSide("image")).toBe(false);
  });

  it("blocks an oversized text file and lets a huge video through", () => {
    expect(isOversizeForPreview("text", TEXT_PREVIEW_LIMIT_BYTES + 1)).toBe(true);
    expect(isOversizeForPreview("text", TEXT_PREVIEW_LIMIT_BYTES)).toBe(false);
    expect(isOversizeForPreview("video", 4 * 1024 * 1024 * 1024)).toBe(false);
  });

  it("does not block on a size the index never reported", () => {
    expect(isOversizeForPreview("text", undefined)).toBe(false);
    expect(isOversizeForPreview("text", Number.NaN)).toBe(false);
  });
});

describe("previewLanguageOf", () => {
  it("only ever names a grammar that is already in the dependency tree", () => {
    expect(previewLanguageOf("md")).toBe("markdown");
    expect(previewLanguageOf("html")).toBe("html");
    expect(previewLanguageOf("css")).toBe("css");
    expect(previewLanguageOf("ts")).toBe("javascript");
    // JSON rides the JavaScript parser; there is no lang-json here and
    // adding one to colour a config file isn't worth a dependency.
    expect(previewLanguageOf("json")).toBe("javascript");
  });

  it("falls back to plain text rather than to a package that isn't installed", () => {
    expect(previewLanguageOf("py")).toBeNull();
    expect(previewLanguageOf("yaml")).toBeNull();
    expect(previewLanguageOf("log")).toBeNull();
  });
});
