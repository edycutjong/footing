// Health: build sha, published Remote Config template version, whether App Check verification can run, render time. No secrets.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function GET() {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const [rc, jwks] = await Promise.allSettled([
    withTimeout(
      fetch(`https://firebaseremoteconfig.googleapis.com/v1/projects/${project}/namespaces/firebase:fetch?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appInstanceId: "footing-health-probe-00000000" }),
        cache: "no-store",
      }).then(async (r) => (r.ok ? ((await r.json()) as { templateVersion?: string }).templateVersion ?? null : null)),
      4000,
    ),
    withTimeout(fetch("https://firebaseappcheck.googleapis.com/v1/jwks", { cache: "no-store" }).then((r) => r.ok), 4000),
  ]);
  const sha = process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null;
  const body = {
    ok: true,
    sha: sha ? sha.slice(0, 7) : null,
    rcTemplateVersion: rc.status === "fulfilled" ? rc.value : null,
    appCheckVerify: jwks.status === "fulfilled" && jwks.value === true && Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    rendered_utc: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
