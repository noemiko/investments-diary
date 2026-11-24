import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "astro/zod";
import { canonicalJson, type SigningKeyRing } from "./signing";
import type { RecoveryPayload } from "./schema";

const confirmationSchema = z.strictObject({
  version: z.literal(1),
  user_id: z.uuid(),
  deployment_id: z.string().min(1).max(200),
  operation: z.enum(["replace", "undo"]),
  operation_id: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot_id: z.uuid().nullable(),
  expires_at: z.number().int().positive(),
});
export type Confirmation = z.infer<typeof confirmationSchema>;
export class ConfirmationError extends Error {
  constructor(public readonly reason: "invalid_confirmation" | "expired_preview") {
    super(reason);
  }
}
export function portfolioDigest(data: RecoveryPayload): string {
  return createHash("sha256").update(canonicalJson(data), "utf8").digest("hex");
}
export function undoDigest(snapshotId: string): string {
  return createHash("sha256").update(`undo:${snapshotId}`, "utf8").digest("hex");
}
function mac(key: string, keyId: string, body: string) {
  return createHmac("sha256", key)
    .update("portfolio-confirmation-v1\n")
    .update(keyId)
    .update("\n")
    .update(body)
    .digest();
}
export function createConfirmation(
  input: Omit<Confirmation, "version" | "operation_id" | "expires_at">,
  keys: SigningKeyRing,
  now = Date.now(),
): string {
  const value = confirmationSchema.parse({
    ...input,
    version: 1,
    operation_id: randomUUID(),
    expires_at: now + 600_000,
  });
  const body = Buffer.from(canonicalJson(value), "utf8").toString("base64url");
  const key = keys.keys[keys.activeKeyId];
  if (!key) throw new ConfirmationError("invalid_confirmation");
  return `${keys.activeKeyId}.${body}.${mac(key, keys.activeKeyId, body).toString("hex")}`;
}
export function verifyConfirmation(
  token: string,
  expected: Pick<Confirmation, "user_id" | "deployment_id" | "operation" | "digest">,
  keys: SigningKeyRing,
  now = Date.now(),
): Confirmation {
  if (token.length > 8192) throw new ConfirmationError("invalid_confirmation");
  const parts = token.split(".");
  const [keyId, body, signature] = parts;
  if (
    parts.length !== 3 ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(keyId) ||
    !/^[A-Za-z0-9_-]+$/.test(body) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new ConfirmationError("invalid_confirmation");
  const key = Object.hasOwn(keys.keys, keyId) ? keys.keys[keyId] : undefined;
  if (!key || !timingSafeEqual(mac(key, keyId, body), Buffer.from(signature, "hex")))
    throw new ConfirmationError("invalid_confirmation");
  let value: Confirmation;
  try {
    value = confirmationSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown);
  } catch {
    throw new ConfirmationError("invalid_confirmation");
  }
  if (
    value.user_id !== expected.user_id ||
    value.deployment_id !== expected.deployment_id ||
    value.operation !== expected.operation ||
    value.digest !== expected.digest
  )
    throw new ConfirmationError("invalid_confirmation");
  if (value.expires_at <= now) throw new ConfirmationError("expired_preview");
  return value;
}
