import { describe, expect, it } from "vitest";
import { basenameOf, buildAttachmentRenamePath, buildNoteRenamePath, folderOf, joinVaultPath } from "./rename";

describe("folderOf / basenameOf / joinVaultPath", () => {
  it("splits a nested path", () => {
    expect(folderOf("notes/sub/cafe.md")).toBe("notes/sub");
    expect(basenameOf("notes/sub/cafe.md")).toBe("cafe.md");
  });

  it("treats a root-level path as folder ''", () => {
    expect(folderOf("cafe.md")).toBe("");
    expect(basenameOf("cafe.md")).toBe("cafe.md");
  });

  it("round-trips through joinVaultPath, root included", () => {
    expect(joinVaultPath("notes/sub", "cafe.md")).toBe("notes/sub/cafe.md");
    expect(joinVaultPath("", "cafe.md")).toBe("cafe.md");
  });
});

describe("buildNoteRenamePath", () => {
  it("keeps the note's folder and appends .md", () => {
    expect(buildNoteRenamePath("notes/cafe.md", "Coffee notes")).toEqual({
      path: "notes/Coffee notes.md",
    });
  });

  it("strips a .md the user typed anyway — the extension is never shown elsewhere in this app", () => {
    expect(buildNoteRenamePath("notes/cafe.md", "coffee.md")).toEqual({ path: "notes/coffee.md" });
  });

  it("trims surrounding whitespace", () => {
    expect(buildNoteRenamePath("notes/cafe.md", "  coffee  ")).toEqual({ path: "notes/coffee.md" });
  });

  it("rejects an empty name", () => {
    expect(buildNoteRenamePath("notes/cafe.md", "   ")).toEqual({ error: "Enter a name." });
  });

  it("rejects a name that tries to change folder — this dialog renames in place only", () => {
    const result = buildNoteRenamePath("notes/cafe.md", "sub/coffee");
    expect(result.error).toBeDefined();
  });
});

describe("buildAttachmentRenamePath", () => {
  it("keeps the attachment's folder, edits the full filename", () => {
    expect(buildAttachmentRenamePath("scans/report.pdf", "final-report.pdf")).toEqual({
      path: "scans/final-report.pdf",
    });
  });

  it("rejects an empty name", () => {
    expect(buildAttachmentRenamePath("scans/report.pdf", "")).toEqual({
      error: "Enter a file name.",
    });
  });

  it("rejects a name with a path separator", () => {
    expect(buildAttachmentRenamePath("scans/report.pdf", "a/b.pdf").error).toBeDefined();
  });

  it("rejects a .md name — that belongs to the note endpoint, not this one", () => {
    expect(buildAttachmentRenamePath("scans/report.pdf", "notes.md").error).toBeDefined();
  });
});
