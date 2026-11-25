import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fromGitHub, fromGit, fromPackage, resolveRelease, stamp, PAGES } from "../scripts/release-version.mjs";

const ok = (body: unknown) => async () => ({ ok: true, json: async () => body }) as Response;
const api = { tag_name: "v1.1.0", html_url: "https://github.com/edycutjong/footing/releases/tag/v1.1.0" };

describe("release stamp: source of truth is the GitHub release", () => {
  it("takes the tag and release URL from the API, sending the token when one is set", async () => {
    let seen: RequestInit | undefined;
    const r = await fromGitHub({ token: "t0k", fetchImpl: async (_u: unknown, init?: RequestInit) => { seen = init; return ok(api)(); } });
    expect(r).toEqual({ tag: "v1.1.0", url: api.html_url, source: "github-api" });
    expect((seen?.headers as Record<string, string>).authorization).toBe("Bearer t0k");
  });
  it("works unauthenticated", async () => {
    let seen: RequestInit | undefined;
    await fromGitHub({ token: "", fetchImpl: async (_u: unknown, init?: RequestInit) => { seen = init; return ok(api)(); } });
    expect((seen?.headers as Record<string, string>).authorization).toBeUndefined();
  });
  it("returns null on a network error, an HTTP error or an unexpected body (never throws)", async () => {
    expect(await fromGitHub({ fetchImpl: async () => { throw new Error("offline"); } })).toBeNull();
    expect(await fromGitHub({ fetchImpl: async () => ({ ok: false }) as Response })).toBeNull();
    expect(await fromGitHub({ fetchImpl: ok({ tag_name: "<script>" }) })).toBeNull();
  });
  it("never links off the repo's releases even if the API body says so", async () => {
    const r = await fromGitHub({ fetchImpl: ok({ tag_name: "v2.0.0", html_url: "https://evil.example/x" }) });
    expect(r?.url).toBe("https://github.com/edycutjong/footing/releases/tag/v2.0.0");
  });
  it("falls back to git describe, then package.json, so an offline build still stamps", async () => {
    const offline = async () => { throw new Error("offline"); };
    expect(await resolveRelease({ fetchImpl: offline, run: () => "v1.0.0\n" })).toMatchObject({ tag: "v1.0.0", source: "git-describe" });
    const noGit = () => { throw new Error("no tags"); };
    expect(await resolveRelease({ fetchImpl: offline, run: noGit, pkgJson: '{"version":"1.1.0"}' }))
      .toEqual({ tag: "v1.1.0", url: "https://github.com/edycutjong/footing/releases/latest", source: "package.json" });
    expect(fromGit(() => "not-a-tag")).toBeNull();
    expect(fromPackage('{"version":"oops"}').tag).toBe("v0.0.0");
  });
});

describe("stamp()", () => {
  it("rewrites only the release links and counts them", () => {
    const html = '<p>v1.0.0 <a data-release href="https://github.com/edycutjong/footing/releases/tag/v1.0.0">v1.0.0</a> · <a href="/x">x</a></p>';
    const r = stamp(html, { tag: "v1.2.3", url: "https://github.com/edycutjong/footing/releases/tag/v1.2.3" });
    expect(r.count).toBe(1);
    expect(r.html).toBe('<p>v1.0.0 <a data-release href="https://github.com/edycutjong/footing/releases/tag/v1.2.3">v1.2.3</a> · <a href="/x">x</a></p>');
  });
  it.each(PAGES as string[])("%s carries at least one release link for the build to stamp", (page) => {
    expect(stamp(readFileSync(page, "utf8"), { tag: "v9.9.9", url: "u" }).count).toBeGreaterThan(0);
  });
});
