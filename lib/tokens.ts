import { SignJWT, jwtVerify } from "jose";
import { getConfig } from "./config";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().AUTH_SECRET);
}

/** Short-lived signed recovery token (15 minutes). */
export async function signRecoveryToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email, purpose: "password-recovery" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey());
}

export async function verifyRecoveryToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "password-recovery") return null;
    return { userId: String(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}

