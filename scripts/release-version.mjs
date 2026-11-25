// Build step: stamps the latest GitHub release into the static landing page (/about) and deck (/pitch).
// Runs before `next build` (npm run build), so it runs in CI's `vercel build` too. The pages never call GitHub
// themselves (CSP, privacy): the tag is resolved here, once, and written into the HTML as a plain link.
// Source of truth: the GitHub Releases API (GITHUB_TOKEN / GH_TOKEN if set, unauthenticated otherwise).
// A tag pinned by CI (FOOTING_RELEASE_TAG) wins. Fallbacks, so an offline build never fails: `git describe --tags
// --abbrev=0`, then package.json's version.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = "edycutjong/footing";
export const PAGES = ["public/landing/index.html", "public/pitch/index.html"];
const RELEASES = `https://github.com/${REPO}/releases`;
// Plain release tags only (release.yml cuts vX.Y.Z; /releases/latest never returns a pre-release).
const TAG = /^(v?)(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

/** Rebuilds a tag from its parsed numbers, so nothing read off the network is written into a page verbatim. */
export function cleanTag(raw) {
  const m = TAG.exec(String(raw).trim());
  return m ? `${m[1] ? "v" : ""}${Number(m[2])}.${Number(m[3])}.${Number(m[4])}` : null;
}
// The one element the stamp rewrites. Anything else in the page is left byte-for-byte alone.
const MARK = /<a data-release href="[^"]*">[^<]*<\/a>/g;

/** Latest release from the API, or null (offline, rate-limited, no release, unexpected shape). */
export async function fromGitHub({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN, timeoutMs = 5000 } = {}) {
  try {
    const headers = { accept: "application/vnd.github+json", "user-agent": "footing-build", "x-github-api-version": "2022-11-28" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const j = await r.json();
    const tag = cleanTag(j?.tag_name ?? "");
    // The link is built from the cleaned tag, never taken from the response body.
    return tag ? { tag, url: `${RELEASES}/tag/${tag}`, source: "github-api" } : null;
  } catch {
    return null;
  }
}

export function fromGit(run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) {
  try {
    const tag = cleanTag(run("git", ["describe", "--tags", "--abbrev=0"]));
    return tag ? { tag, url: `${RELEASES}/tag/${tag}`, source: "git-describe" } : null;
  } catch {
    return null;
  }
}

export function fromPackage(pkgJson = readFileSync(new URL("../package.json", import.meta.url), "utf8")) {
  const tag = cleanTag(`v${JSON.parse(pkgJson).version}`) ?? "v0.0.0";
  return { tag, url: `${RELEASES}/latest`, source: "package.json" };
}

/** A tag CI already resolved with its token and handed to a remote (Vercel) build, which has no token and no .git. */
export function fromPinned(env = process.env.FOOTING_RELEASE_TAG) {
  const tag = env ? cleanTag(env) : null;
  return tag ? { tag, url: `${RELEASES}/tag/${tag}`, source: "FOOTING_RELEASE_TAG" } : null;
}

export async function resolveRelease(deps = {}) {
  return fromPinned(deps.pinned) ?? (await fromGitHub(deps)) ?? fromGit(deps.run) ?? fromPackage(deps.pkgJson);
}

/** Rewrites every release link in a page. Returns the new HTML and how many links it stamped. */
export function stamp(html, { tag, url }) {
  let n = 0;
  const out = html.replace(MARK, () => (n++, `<a data-release href="${url}">${tag}</a>`));
  return { html: out, count: n };
}

async function main() {
  const rel = await resolveRelease();
  if (process.argv.includes("--print")) return void console.log(rel.tag); // CI: resolve only, stamp nothing
  const root = fileURLToPath(new URL("..", import.meta.url));
  for (const page of PAGES) {
    const path = `${root}${page}`;
    const before = readFileSync(path, "utf8");
    const { html, count } = stamp(before, rel);
    // A page that lost its release link is a markup bug, not a network problem: fail loudly.
    if (count === 0) throw new Error(`${page}: no <a data-release> link to stamp`);
    if (html !== before) writeFileSync(path, html);
    console.log(`release ${rel.tag} (${rel.source}) -> ${page} (${count} link${count === 1 ? "" : "s"}${html === before ? ", unchanged" : ""})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
