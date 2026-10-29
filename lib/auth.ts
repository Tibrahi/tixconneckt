import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { isProduction } from "./config";

function createAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      useSecureCookies: isProduction(),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
    user: {
      additionalFields: {
        shortId: { type: "string", required: true },
        phone: { type: "string", required: false },
        phoneVerified: { type: "boolean", required: false },
        country: { type: "string", required: false },
        countryCode: { type: "string", required: false },
        timezone: { type: "string", required: false },
        category: { type: "string", required: false },
        role: { type: "string", required: false },
        status: { type: "string", required: false },
      },
    },
    plugins: [nextCookies()],
    trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

/**
 * Better Auth instance with secure cookie defaults:
 * HttpOnly, Secure in production, SameSite=Lax, server-side validation.
 */
export function getAuth(): Auth {
  cached ??= createAuth();
  return cached;
}
