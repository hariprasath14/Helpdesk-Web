export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordStrength {
  /** 0 empty or too short, 1 weak, 2 fair, 3 good, 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

/**
 * A quick guide for the strength bar. The real rules are length (at least 12) and the server's
 * check against known breached passwords; there are no "must include a symbol" rules, as current
 * guidance (NIST 800-63B) recommends. Length and variety raise the score; repeats lower it.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { score: 0, label: '' };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { score: 0, label: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters` };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((kind) =>
    kind.test(password),
  ).length;
  const unique = new Set(password).size;
  let points = 1;
  if (password.length >= 16) points += 1;
  if (password.length >= 20) points += 1;
  if (kinds >= 3) points += 1;
  if (unique < password.length / 3) points -= 1;
  const score = Math.min(4, Math.max(1, points)) as PasswordStrength['score'];
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] ?? '' };
}
