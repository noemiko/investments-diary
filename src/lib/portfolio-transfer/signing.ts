import { z } from "astro/zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { recoveryPayloadSchema, TRANSFER_LIMITS, type RecoveryPayload } from "./schema";

export interface SigningKeyRing {
  activeKeyId: string;
  keys: Record<string, string>;
}
export interface SignedRecovery {
  key_id: string;
  payload: string;
  signature: string;
}
export class TransferError extends Error {
  constructor(
    public readonly reason: "invalid_file" | "too_large" | "invalid_signature" | "wrong_deployment" | "not_configured",
  ) {
    super(reason);
  }
}

/** Object keys are sorted; array order and decimal/date strings remain untouched. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}
const mac = (key: string, keyId: string, payload: string) =>
  createHmac("sha256", key)
    .update("portfolio-recovery-v1\n")
    .update(keyId)
    .update("\n")
    .update(payload, "utf8")
    .digest();

export function signRecovery(value: RecoveryPayload, keyRing: SigningKeyRing): SignedRecovery {
  const parsed = recoveryPayloadSchema.parse(value);
  const key = keyRing.keys[keyRing.activeKeyId];
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new TransferError("not_configured");
  const payload = canonicalJson(parsed);
  if (Buffer.byteLength(payload, "utf8") > TRANSFER_LIMITS.payloadBytes) throw new TransferError("too_large");
  return { key_id: keyRing.activeKeyId, payload, signature: mac(key, keyRing.activeKeyId, payload).toString("hex") };
}

export function verifyRecovery(
  envelope: SignedRecovery,
  keyRing: SigningKeyRing,
  deploymentId: string,
): RecoveryPayload {
  if (Buffer.byteLength(envelope.payload, "utf8") > TRANSFER_LIMITS.payloadBytes) throw new TransferError("too_large");
  const key = Object.hasOwn(keyRing.keys, envelope.key_id) ? keyRing.keys[envelope.key_id] : undefined;
  if (!key || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new TransferError("invalid_signature");
  if (!timingSafeEqual(mac(key, envelope.key_id, envelope.payload), Buffer.from(envelope.signature, "hex")))
    throw new TransferError("invalid_signature");
  // Authentication precedes JSON parsing and interpretation of the uploaded recovery state.
  let parsed: RecoveryPayload;
  try {
    parsed = recoveryPayloadSchema.parse(JSON.parse(envelope.payload) as unknown);
  } catch {
    throw new TransferError("invalid_file");
  }
  if (parsed.deployment_id !== deploymentId) throw new TransferError("wrong_deployment");
  return parsed;
}

export function parseSigningKeyRing(raw: string): SigningKeyRing {
  try {
    const parsed = z
      .strictObject({
        activeKeyId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        keys: z.record(
          z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
          z.string().refine((key) => Buffer.byteLength(key, "utf8") >= 32),
        ),
      })
      .parse(JSON.parse(raw) as unknown);
    if (!Object.hasOwn(parsed.keys, parsed.activeKeyId)) throw new TransferError("not_configured");
    return parsed;
  } catch {
    throw new TransferError("not_configured");
  }
}
