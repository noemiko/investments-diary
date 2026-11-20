import type { AuthErrorCode } from "@/lib/auth-validation";

const BASE = "https://diary.invalid";
const FALLBACK = "/dashboard";
function unsafe(value: string): boolean {
  for (const character of value) {
    if (character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return true;
  }
  return false;
}
function dashboardPath(path: string): boolean {
  return path === FALLBACK || path.startsWith("/dashboard/");
}

/** A return destination is a dashboard path, never a user-supplied origin. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || unsafe(value)) return FALLBACK;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || !dashboardPath(url.pathname)) return FALLBACK;
    let path = url.pathname;
    // Check encoded and multiply encoded traversal before returning the original safe URL.
    for (let depth = 0; depth < 6; depth++) {
      if (unsafe(path) || !dashboardPath(new URL(path, BASE).pathname)) return FALLBACK;
      const decoded = decodeURIComponent(path);
      if (decoded === path) return url.pathname + url.search;
      path = decoded;
    }
  } catch {
    return FALLBACK;
  }
  return FALLBACK;
}

export function signInLocation(returnTo: unknown, error?: AuthErrorCode): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  params.set("returnTo", safeReturnTo(returnTo));
  return `/auth/signin?${params.toString()}`;
}
