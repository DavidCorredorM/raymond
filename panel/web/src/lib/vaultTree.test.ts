import { describe, expect, it } from "vitest";
import type { Attachment, NoteSummary } from "../api/types";
import {
  buildVaultTree,
  sortedAttachments,
  sortedFolders,
  sortedNotes,
  type VaultTreeNode,
} from "./vaultTree";

function note(path: string, title = path): NoteSummary {
  return { path, slug: title, title, frontmatter: {}, mtime: 0, size: 0, isSystem: false };
}

function file(path: string, size = 10): Attachment {
  return { path, size, mtime: 0, isSystem: false };
}

/** Walks a "a/b/c" folder path in the built tree. */
function at(root: VaultTreeNode, path: string): VaultTreeNode {
  let cursor = root;
  for (const seg of path.split("/")) {
    const next = cursor.folders.get(seg);
    if (!next) throw new Error(`no folder ${path} (missing ${seg})`);
    cursor = next;
  }
  return cursor;
}

describe("buildVaultTree", () => {
  it("puts notes and attachments in the same folder node", () => {
    const tree = buildVaultTree(
      [note("companies/sigra/00-Estrategia/objetivos.md", "Objetivos")],
      [file("companies/sigra/00-Estrategia/tablero-2026-08.pdf")],
    );
    const folder = at(tree, "companies/sigra/00-Estrategia");
    expect(folder.notes.map((n) => n.path)).toEqual([
      "companies/sigra/00-Estrategia/objetivos.md",
    ]);
    expect(folder.attachments.map((a) => a.path)).toEqual([
      "companies/sigra/00-Estrategia/tablero-2026-08.pdf",
    ]);
    // One folder chain, not one per index.
    expect(at(tree, "companies").folders.size).toBe(1);
  });

  it("creates folders that exist only because of an attachment", () => {
    const tree = buildVaultTree([], [file("holding/reportes/cierre.xlsx")]);
    expect(at(tree, "holding/reportes").attachments).toHaveLength(1);
    expect(at(tree, "holding/reportes").path).toBe("holding/reportes");
  });

  it("keeps root-level files at the root", () => {
    const tree = buildVaultTree([note("index.md")], [file("logo.png")]);
    expect(tree.notes).toHaveLength(1);
    expect(tree.attachments).toHaveLength(1);
    expect(tree.folders.size).toBe(0);
  });

  it("is unchanged for a notes-only vault (attachments default to none)", () => {
    const tree = buildVaultTree([note("a/one.md"), note("a/two.md"), note("b/three.md")]);
    expect(at(tree, "a").notes).toHaveLength(2);
    expect(at(tree, "b").notes).toHaveLength(1);
    expect(at(tree, "a").attachments).toEqual([]);
  });

  it("does not invent an empty segment from a leading slash", () => {
    const tree = buildVaultTree([], [file("/odd/leading.png")]);
    expect([...tree.folders.keys()]).toEqual(["odd"]);
  });

  it("nests folders whose names repeat at different depths", () => {
    const tree = buildVaultTree(
      [note("a/docs/x.md")],
      [file("b/docs/y.pdf"), file("a/docs/z.pdf")],
    );
    expect(at(tree, "a/docs").attachments).toHaveLength(1);
    expect(at(tree, "b/docs").attachments).toHaveLength(1);
  });
});

describe("sorting", () => {
  it("orders folders by name, notes by title, attachments by filename", () => {
    const tree = buildVaultTree(
      [note("zeta/b.md", "Beta"), note("alpha/a.md", "Alpha"), note("n2.md", "Zulu"), note("n1.md", "Aardvark")],
      [file("z/deep.pdf"), file("b.png"), file("a.png")],
    );
    expect(sortedFolders(tree).map((f) => f.name)).toEqual(["alpha", "z", "zeta"]);
    expect(sortedNotes(tree).map((n) => n.title)).toEqual(["Aardvark", "Zulu"]);
    expect(sortedAttachments(tree).map((a) => a.path)).toEqual(["a.png", "b.png"]);
  });
});
