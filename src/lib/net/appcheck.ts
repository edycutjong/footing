// Server-side App Check verification for /api/fetch (the docs' JWT recipe: RS256, App Check JWKS,
// issuer = https://firebaseappcheck.googleapis.com/<project number>, audience contains projects/<project number>).
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://firebaseappcheck.googleapis.com/v1/jwks"), { cacheMaxAge: 6 * 60 * 60 * 1000 });

export async function verifyAppCheck(token: string | null, projectNumber = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID): Promise<{ ok: boolean; reason?: string; appId?: string }> {
  if (!token) return { ok: false, reason: "missing App Check token" };
  if (!projectNumber) return { ok: false, reason: "server not configured" };
  try {
    const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
      issuer: `https://firebaseappcheck.googleapis.com/${projectNumber}`,
      audience: `projects/${projectNumber}`,
    });
    if (protectedHeader.typ !== "JWT") return { ok: false, reason: "bad token type" };
    return { ok: true, appId: String(payload.sub ?? "") };
  } catch (e) {
    return { ok: false, reason: `App Check token rejected (${(e as Error).name})` };
  }
}
