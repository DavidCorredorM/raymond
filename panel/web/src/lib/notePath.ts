/** Vault-relative note path -> a safe `/vault/note/*` route href. */
export function noteHref(path: string): string {
  return "/vault/note/" + path.split("/").map(encodeURIComponent).join("/");
}
