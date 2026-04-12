import "server-only";

/**
 * Single source of truth for admin email comparison.
 * Used by proxy.ts, admin layout, admin pages, and requireAdmin().
 * Per D-05: simple string equality against ADMIN_EMAIL env var.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email === process.env.ADMIN_EMAIL;
}
