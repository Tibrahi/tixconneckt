import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a random 4-character candidate (server-side only). */
export function randomShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Generate a unique short identifier, enforcing DB uniqueness with retries. */
export async function generateUniqueShortId(maxAttempts = 20): Promise<string> {
  const db = getDb();
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = randomShortId();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.shortId, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error("Could not generate a unique user identifier");
}
