import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export interface AuthClaims {
  sub: string;
  username: string;
  role: "user" | "admin";
  exp: number;
}

function encode(value: string | object): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(raw).toString("base64url");
}

function decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function signature(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function issueToken(
  claims: Omit<AuthClaims, "exp">,
  secret: string,
  lifetimeSeconds = 60 * 60 * 24 * 7,
): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ ...claims, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds });
  return `${header}.${payload}.${signature(`${header}.${payload}`, secret)}`;
}

export function verifyToken(token: string, secret: string): AuthClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = signature(`${parts[0]}.${parts[1]}`, secret);
    const actual = parts[2];
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    if (
      expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)
    )
      return null;
    const claims = decode<AuthClaims>(parts[1]);
    if (!claims.sub || !claims.username || !claims.exp || claims.exp < Date.now() / 1000)
      return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearerToken(headers: IncomingHttpHeaders): string | null {
  const value = headers.authorization;
  if (typeof value !== "string") return null;
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
