// Staff sign in with a username. Supabase Auth needs an email, so each login's
// email is <username>@pitstop.invalid (".invalid" can never receive mail).

export const LOGIN_DOMAIN = "pitstop.invalid";
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const USERNAME_HINT = "3-30 characters: lowercase letters, numbers, dots, dashes or underscores.";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The email Supabase signs in with for a username. */
export function loginEmail(username: string): string {
  return `${normalizeUsername(username)}@${LOGIN_DOMAIN}`;
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "Enter a username.";
  if (!USERNAME_RE.test(u)) return `Usernames are ${USERNAME_HINT}`;
  return null;
}
