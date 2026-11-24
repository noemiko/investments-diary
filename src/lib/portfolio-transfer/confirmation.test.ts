import { expect, it } from "vitest";
import { createConfirmation, portfolioDigest, undoDigest, verifyConfirmation } from "./confirmation";
import { examplePortfolio } from "./fixtures";
import { signRecovery } from "./signing";
const keys = { activeKeyId: "test", keys: { test: "synthetic-key-with-more-than-32-characters" } };
const expected = {
  user_id: "00000000-0000-4000-8000-000000000001",
  deployment_id: "test-diary",
  operation: "replace" as const,
  digest: portfolioDigest(examplePortfolio()),
};
it("binds ten-minute confirmation to the preview and retains old verification keys", () => {
  const token = createConfirmation({ ...expected, fingerprint: "a".repeat(64), snapshot_id: null }, keys, 1000);
  const rotated = { activeKeyId: "next", keys: { ...keys.keys, next: "another-synthetic-key-over-32-characters" } };
  expect(verifyConfirmation(token, expected, rotated, 600_999)).toMatchObject({
    ...expected,
    expires_at: 601_000,
    fingerprint: "a".repeat(64),
  });
  expect(() => verifyConfirmation(token, expected, keys, 601_000)).toThrow("expired_preview");
  expect(() => verifyConfirmation(token, { ...expected, deployment_id: "other" }, keys, 1000)).toThrow(
    "invalid_confirmation",
  );
  expect(() => verifyConfirmation(token, { ...expected, digest: undoDigest("other") }, keys, 1000)).toThrow(
    "invalid_confirmation",
  );
});
it("does not accept backup-domain signatures as confirmation signatures", () => {
  const value = signRecovery(examplePortfolio(), keys);
  const fake = `${value.key_id}.${Buffer.from(value.payload).toString("base64url")}.${value.signature}`;
  expect(() => verifyConfirmation(fake, expected, keys)).toThrow("invalid_confirmation");
});
