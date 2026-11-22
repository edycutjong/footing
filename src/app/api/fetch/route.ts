// Non-AI fetch proxy: the browser cannot read cross-origin sources, so this route fetches the cited URL for it.
// It does no inference (all AI runs through Firebase AI Logic in the browser). App Check token required.
import { fetchSource } from "@/lib/net/fetchSource";
import { verifyAppCheck } from "@/lib/net/appcheck";
import { TokenBucket } from "@/lib/net/ssrf";

const bucket = new TokenBucket(40, 0.5); // burst 40, then 30 per minute per client IP

export async function GET(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  // Vercel sets x-real-ip / x-vercel-forwarded-for itself; a client-sent X-Forwarded-For is only the last resort.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-vercel-forwarded-for") ?? (req.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ?? "local";
  if (!bucket.take(ip)) return json({ ok: false, error: "too many requests" }, 429);
  const ac = await verifyAppCheck(req.headers.get("x-firebase-appcheck"));
  if (!ac.ok) return json({ ok: false, error: ac.reason }, 401);
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return json({ ok: false, error: "missing url" }, 400);
  return json(await fetchSource(url));
}
