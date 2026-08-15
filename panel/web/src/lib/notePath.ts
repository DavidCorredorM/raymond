/** Vault-relative note path -> a safe `/note/*` route href. */
export function noteHref(path: string): string {
  return "/note/" + path.split("/").map(encodeURIComponent).join("/");
}
