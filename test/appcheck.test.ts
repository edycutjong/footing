import { describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { verifyAppCheck } from "@/lib/net/appcheck";

// A local RS256 key stands in for the App Check JWKS; claims mirror a real App Check token (iss, aud, sub = app id).
const PN = "123456789";
const APP = "1:123456789:web:abc";
async function token(sub: string, key: CryptoKey, typ = "JWT") {
  return new SignJWT({}).setProtectedHeader({ alg: "RS256", typ }).setIssuer(`https://firebaseappcheck.googleapis.com/${PN}`)
    .setAudience([`projects/${PN}`, "projects/footing-test"]).setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(key);
}

describe("verifyAppCheck (server side of /api/fetch)", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  it("accepts a valid token for this app", async () => {
    expect(await verifyAppCheck(await token(APP, privateKey), PN, APP, publicKey)).toMatchObject({ ok: true, appId: APP });
  });
  it("refuses a valid token minted for another app in the project (a2a r03 sub pin)", async () => {
    expect(await verifyAppCheck(await token("1:123456789:web:other", privateKey), PN, APP, publicKey)).toMatchObject({ ok: false, reason: "token is for another app" });
  });
  it("fails closed when the server is not configured", async () => {
    expect((await verifyAppCheck(await token(APP, privateKey), PN, undefined, publicKey)).reason).toBe("server not configured");
    expect((await verifyAppCheck(await token(APP, privateKey), undefined, APP, publicKey)).reason).toBe("server not configured");
  });
  it("refuses a missing token, a wrong type and a token signed by another key", async () => {
    expect((await verifyAppCheck(null, PN, APP, publicKey)).ok).toBe(false);
    expect((await verifyAppCheck(await token(APP, privateKey, "at+jwt"), PN, APP, publicKey)).reason).toBe("bad token type");
    const other = await generateKeyPair("RS256");
    expect((await verifyAppCheck(await token(APP, other.privateKey), PN, APP, publicKey)).ok).toBe(false);
  });
});
