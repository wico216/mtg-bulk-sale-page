export interface WBinderShareLink {
  id: number;
  label: string;
  scope: "w_binders";
  allowedBinders: string[] | null;
  createdByEmail: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}
