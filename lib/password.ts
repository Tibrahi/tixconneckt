import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTIONS = { N: 16_384, r: 16, p: 1, maxmem: 128 * 16_384 * 16 * 2 };
const KEY_LENGTH = 64;

async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Keeps existing stored scrypt password hashes compatible with the app. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = input;
  const [salt, encoded, ...extra] = hash.split(":");
  if (!salt || !encoded || extra.length > 0 || !/^[a-f\d]{128}$/i.test(encoded)) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = await derive(password, salt);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
