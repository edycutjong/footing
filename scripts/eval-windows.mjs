// Where the judge's source-text windows live between `eval:prepare` and `eval:live` / `bench`.
// Third-party text, so never committed: a repo-local, gitignored folder readable only by this user (0700), not the
// shared OS temp dir, where another local user could pre-create or swap the file.
import { mkdirSync } from "node:fs";

export const WINDOWS_DIR = ".cache/footing-eval";
export const windowsPath = (set) => `${WINDOWS_DIR}/${set}-windows.json`;
export function ensureWindowsDir() {
  mkdirSync(WINDOWS_DIR, { recursive: true, mode: 0o700 });
}
