import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { validateSignIn, type SignInErrors } from "@/lib/auth-validation";

interface Props {
  serverError?: string | null;
  returnTo?: string;
}

function noopSubscribe() {
  return () => undefined;
}

export default function SignInForm({ serverError, returnTo = "/dashboard" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<SignInErrors>({});
  const [pending, setPending] = useState(false);
  // A ref closes the gap before the pending render when Enter is pressed repeatedly.
  const submitting = useRef(false);
  const focusValidation = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const errorAlert = useRef<HTMLParagraphElement>(null);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (serverError) errorAlert.current?.focus();
    else emailInput.current?.focus();
    function restore() {
      submitting.current = false;
      setPending(false);
      setPassword("");
      setShowPassword(false);
      if (passwordInput.current) passwordInput.current.value = "";
    }
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
    };
  }, [serverError]);

  useEffect(() => {
    if (!focusValidation.current) return;
    focusValidation.current = false;
    if (errors.email) emailInput.current?.focus();
    else if (errors.password) passwordInput.current?.focus();
  }, [errors]);

  function clearError(field: keyof SignInErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (submitting.current) {
      e.preventDefault();
      return;
    }
    // Read the actual controls so browser/password-manager autofill is respected.
    const enteredEmail = emailInput.current?.value ?? email;
    const enteredPassword = passwordInput.current?.value ?? password;
    const next = validateSignIn(enteredEmail, enteredPassword);
    focusValidation.current = Object.keys(next).length > 0;
    setErrors(next);
    if (Object.keys(next).length) {
      e.preventDefault();
      return;
    }
    const trimmedEmail = enteredEmail.trim();
    setEmail(trimmedEmail);
    setPassword(enteredPassword);
    if (emailInput.current) emailInput.current.value = trimmedEmail;
    submitting.current = true;
    setPending(true);
    // Native POST proceeds; the credential controls stay enabled and named.
  }

  return (
    <form
      method="POST"
      action="/api/auth/signin"
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate={hydrated}
      aria-busy={pending}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormField
        id="email"
        type="email"
        label="Email"
        value={email}
        inputRef={emailInput}
        required
        autoComplete="username"
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@example.com"
        error={errors.email}
        icon={<Mail className="size-4" aria-hidden="true" />}
      />
      <FormField
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        inputRef={passwordInput}
        required
        autoComplete="current-password"
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Your password"
        error={errors.password}
        icon={<Lock className="size-4" aria-hidden="true" />}
        endContent={
          hydrated ? (
            <PasswordToggle
              visible={showPassword}
              onToggle={() => {
                setShowPassword(!showPassword);
              }}
            />
          ) : undefined
        }
      />
      <ServerError message={serverError} errorRef={errorAlert} />
      <SubmitButton pending={pending} pendingText="Signing in…" icon={<LogIn className="size-4" aria-hidden="true" />}>
        Sign in
      </SubmitButton>
      <span role="status" className="sr-only">
        {pending ? "Signing in…" : ""}
      </span>
    </form>
  );
}
