import { describe, expect, it } from "vitest";
import {
  attachmentKind,
  attachmentUrl,
  baseName,
  canPreviewInline,
  describeUploadError,
  extensionOf,
  folderOf,
  formatBytes,
  UPLOAD_LIMIT_MB,
} from "./attachments";

describe("path helpers", () => {
  it("encodes the whole path as one query value", () => {
    expect(attachmentUrl("companies/sigra/informe final.pdf")).toBe(
      "/api/attachment?path=companies%2Fsigra%2Finforme%20final.pdf",
    );
  });

  it("splits name and folder", () => {
    expect(baseName("a/b/c.pdf")).toBe("c.pdf");
    expect(baseName("c.pdf")).toBe("c.pdf");
    expect(folderOf("a/b/c.pdf")).toBe("a/b");
    expect(folderOf("c.pdf")).toBe("");
  });

  it("reads extensions case-insensitively and tolerates files without one", () => {
    expect(extensionOf("Report.XLSX")).toBe("xlsx");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe(""); // dotfile, not an extension
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("kinds and previewability", () => {
  it("classifies the types a vault actually accumulates", () => {
    expect(attachmentKind("x.png")).toBe("image");
    expect(attachmentKind("x.pdf")).toBe("pdf");
    expect(attachmentKind("x.xlsx")).toBe("sheet");
    expect(attachmentKind("x.docx")).toBe("doc");
    expect(attachmentKind("x.zip")).toBe("archive");
    expect(attachmentKind("x.bin")).toBe("other");
  });

  it("previews images and PDFs only", () => {
    expect(canPreviewInline("a/b.png")).toBe(true);
    expect(canPreviewInline("a/b.pdf")).toBe(true);
    expect(canPreviewInline("a/b.xlsx")).toBe(false);
  });

  it("never previews SVG or HTML — the server serves those as downloads", () => {
    // Rendering uploaded markup on the panel's origin would be stored XSS
    // (README rule 3: no auth). Guard the decision with a test so a later
    // "svg is an image, surely" edit has to argue with it.
    expect(canPreviewInline("logo.svg")).toBe(false);
    expect(canPreviewInline("report.html")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats the ranges a vault attachment lands in", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("does not print NaN for a missing size", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("describeUploadError", () => {
  it("names the size limit on 413 so the user knows what to do", () => {
    const msg = describeUploadError(413, "cierre.xlsx");
    expect(msg).toContain("cierre.xlsx");
    expect(msg).toContain(`${UPLOAD_LIMIT_MB} MB`);
  });

  it("states the conflict on 409 rather than a status code", () => {
    expect(describeUploadError(409, "informe.pdf")).toBe(
      "informe.pdf already exists in this folder.",
    );
  });

  it("treats a status of 0 as unreachable, not as a rejected file", () => {
    expect(describeUploadError(0, "a.png")).toContain("Couldn't reach the panel server");
  });

  it("passes the server's own reason through on 400", () => {
    expect(describeUploadError(400, "a.png", "unsafe filename")).toContain("unsafe filename");
  });

  it("explains a 404 as a missing backend, not a missing file", () => {
    expect(describeUploadError(404, "a.png")).toContain("no upload endpoint");
  });

  it("still says something actionable for an unexpected status", () => {
    expect(describeUploadError(500, "a.png", "boom")).toBe("Upload of a.png failed (500): boom.");
  });
});
