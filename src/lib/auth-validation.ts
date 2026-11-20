export interface SignInErrors {
  email?: string;
  password?: string;
}

export function validateSignIn(email: string, password: string): SignInErrors {
  const errors: SignInErrors = {};
  if (!email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address";
  if (!password) errors.password = "Password is required";
  return errors;
}

/** Reject files, duplicate fields and absent values before contacting the provider. */
export function parseSignInForm(form: FormData): { email: string; password: string } | null {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (form.getAll("email").length !== 1 || form.getAll("password").length !== 1) return null;
  if (Object.keys(validateSignIn(email, password)).length) return null;
  return { email: email.trim(), password };
}

const AUTH_ERRORS = {
  invalid_input: "Enter a valid email address and password.",
  signin_failed: "Unable to sign in. Check your email and password and try again.",
  link_failed: "This link was already used or has expired. Try signing in.",
} as const;
export type AuthErrorCode = keyof typeof AUTH_ERRORS;

export function authErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return Object.hasOwn(AUTH_ERRORS, code) ? AUTH_ERRORS[code as AuthErrorCode] : AUTH_ERRORS.signin_failed;
}
