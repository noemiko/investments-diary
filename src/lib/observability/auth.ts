import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { reportUnexpected } from "@/lib/observability/reporter";

const EXPECTED_CODES = new Set([
  "email_address_invalid",
  "validation_failed",
  "invalid_credentials",
  "email_not_confirmed",
  "email_exists",
  "user_already_exists",
  "signup_disabled",
  "weak_password",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "invalid_jwt",
  "flow_state_not_found",
  "flow_state_expired",
  "otp_expired",
  "bad_code_verifier",
  "pkce_code_verifier_not_found",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);
const EXPECTED_TYPES = new Set([
  "AuthSessionMissingError",
  "AuthInvalidCredentialsError",
  "AuthPKCECodeVerifierMissingError",
  "AuthWeakPasswordError",
  "AuthInvalidJwtError",
  "AuthRefreshDiscardedError",
]);

/** Fail closed for unfamiliar failures; never classify by a potentially private message. */
export function isUnexpectedAuthError(error: unknown): boolean {
  if (!isAuthError(error)) return true;
  if (isAuthRetryableFetchError(error) || (error.status !== undefined && error.status >= 500)) return true;
  return !EXPECTED_TYPES.has(error.name) && !(error.code !== undefined && EXPECTED_CODES.has(error.code));
}

export function reportAuthError(error: unknown, operation: string): void {
  if (error != null && isUnexpectedAuthError(error)) reportUnexpected(error, { operation });
}
