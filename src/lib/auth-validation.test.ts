import { describe, expect, it } from "vitest";
import { authErrorMessage, parseSignInForm, validateSignIn } from "@/lib/auth-validation";

function form(email: string, password: string) {
  const values = new FormData();
  values.set("email", email);
  values.set("password", password);
  return values;
}

describe("signin input", () => {
  it("trims email but preserves password whitespace exactly", () => {
    expect(parseSignInForm(form("  investor@example.test  ", " secret "))).toEqual({
      email: "investor@example.test",
      password: " secret ",
    });
  });
  it.each(["", " ", "bad", "a@", "a @example.test", "a@example"])("rejects invalid email %j", (email) => {
    expect(parseSignInForm(form(email, "secret"))).toBeNull();
  });
  it("validates both required fields", () => {
    expect(validateSignIn("", "")).toEqual({ email: "Email is required", password: "Password is required" });
    expect(parseSignInForm(form("a@example.test", ""))).toBeNull();
    expect(parseSignInForm(new FormData())).toBeNull();
  });
  it("rejects file values and duplicate credentials", () => {
    const values = form("a@example.test", "secret");
    values.set("password", new File(["secret"], "password.txt"));
    expect(parseSignInForm(values)).toBeNull();
    values.set("password", "secret");
    values.append("email", "b@example.test");
    expect(parseSignInForm(values)).toBeNull();
  });
});

describe("fixed auth errors", () => {
  it("renders only local messages, including for unknown provider text", () => {
    const generic = "Unable to sign in. Check your email and password and try again.";
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("signin_failed")).toBe(generic);
    expect(authErrorMessage("User not found: private@example.test")).toBe(generic);
    expect(authErrorMessage("toString")).toBe(generic);
    expect(authErrorMessage("invalid_input")).toBe("Enter a valid email address and password.");
    expect(authErrorMessage("link_failed")).toBe("This link was already used or has expired. Try signing in.");
  });
});
