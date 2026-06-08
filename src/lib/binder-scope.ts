import { normalizeBinderName } from "@/lib/binder-name";

/**
 * Wiko's personal collection binders/folders. These are private inventory, not
 * public sale stock. Manabox binder names are normalized before storage, so W01
 * / w01 / " W01 " all become `w01` and match this predicate.
 */
export function isPrivateWBinder(binder: unknown): boolean {
  return normalizeBinderName(binder).startsWith("w");
}

export function isPublicSaleBinder(binder: unknown): boolean {
  return !isPrivateWBinder(binder);
}
