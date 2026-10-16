// Encrypts and decrypts snapshot files (passphrase from SNAPSHOT_PASSPHRASE).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("PSNAP1");
const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function key(passphrase, salt) {
  if (!passphrase || passphrase.length < 16) throw new Error("SNAPSHOT_PASSPHRASE must be at least 16 characters.");
  return scryptSync(passphrase, salt, 32, KDF);
}

export function encrypt(json, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, "utf8"))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

export function decrypt(buf, passphrase) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("This isn't a Pitstop Plus snapshot.");
  const salt = buf.subarray(6, 22);
  const iv = buf.subarray(22, 34);
  const tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(buf.subarray(34, buf.length - 16)), decipher.final()])).toString("utf8");
  } catch {
    throw new Error("Wrong passphrase, or the file is damaged.");
  }
}
