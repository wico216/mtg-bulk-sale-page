"use client";

import { useMemo, useState } from "react";
import { formatBinderForDisplay } from "@/lib/binder-name";
import type { AdminCard } from "@/lib/types";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";

interface WBinderShareManagerProps {
  cards: AdminCard[];
  initialLinks: WBinderShareLink[];
}

interface CreateShareResponse {
  success: true;
  link: WBinderShareLink;
  shareUrl: string;
}

interface RevokeShareResponse {
  success: true;
  link: WBinderShareLink;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function linkStatus(link: WBinderShareLink): { label: string; active: boolean } {
  if (link.revokedAt) return { label: "Revoked", active: false };
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) {
    return { label: "Expired", active: false };
  }
  return { label: "Active", active: true };
}

function expiresAtFromChoice(choice: string): string | null {
  if (choice === "never") return null;
  const days = Number.parseInt(choice, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : "Request failed";
  } catch {
    return "Request failed";
  }
}

export function WBinderShareManager({ cards, initialLinks }: WBinderShareManagerProps) {
  const [links, setLinks] = useState(initialLinks);
  const [label, setLabel] = useState("");
  const [expiresChoice, setExpiresChoice] = useState("30");
  const [binderMode, setBinderMode] = useState<"all" | "selected">("all");
  const [selectedBinders, setSelectedBinders] = useState<Set<string>>(() => new Set());
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const binderOptions = useMemo(
    () => [...new Set(cards.flatMap((card) => card.binders))].sort(),
    [cards],
  );

  const activeCount = links.filter((link) => linkStatus(link).active).length;
  const defaultLabel = `Private W binder preview ${links.length + 1}`;
  const selectedBinderList = [...selectedBinders].sort();

  const toggleBinder = (binder: string) => {
    setSelectedBinders((current) => {
      const next = new Set(current);
      if (next.has(binder)) next.delete(binder);
      else next.add(binder);
      return next;
    });
  };

  const createLink = async () => {
    setError(null);
    setMessage(null);
    setCreatedUrl(null);

    if (binderMode === "selected" && selectedBinderList.length === 0) {
      setError("Choose at least one W folder or switch back to all W binders.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/admin/w-binder-share-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || defaultLabel,
          expiresAt: expiresAtFromChoice(expiresChoice),
          allowedBinders: binderMode === "selected" ? selectedBinderList : undefined,
        }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as CreateShareResponse;
      setLinks((current) => [body.link, ...current]);
      setCreatedUrl(body.shareUrl);
      setLabel("");
      setMessage("Private link created. Copy it now — the raw token is only shown once.");
      try {
        await navigator.clipboard.writeText(body.shareUrl);
        setMessage("Private link created and copied. The raw token is only shown once.");
      } catch {
        // Clipboard can be blocked by browser permissions; the visible link remains copyable.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setPending(false);
    }
  };

  const revokeLink = async (id: number) => {
    setError(null);
    setMessage(null);
    setRevokingId(id);
    try {
      const response = await fetch(`/api/admin/w-binder-share-links/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as RevokeShareResponse;
      setLinks((current) => current.map((link) => (link.id === id ? body.link : link)));
      setMessage("Share link revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke link");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg)",
        borderRadius: 8,
        padding: 18,
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p
            style={{
              margin: "0 0 6px",
              color: "var(--muted)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}
          >
            Private sharing
          </p>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>
            Share W binders by magic link
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, maxWidth: 720 }}>
            Create revocable links for selected people. They can browse and stage an interest list, but they cannot access admin, checkout, or mutate inventory.
          </p>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {activeCount} active · {links.length} total
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          Link label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={defaultLabel}
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              borderRadius: 4,
              padding: "10px 12px",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          Expiration
          <select
            value={expiresChoice}
            onChange={(event) => setExpiresChoice(event.target.value)}
            style={{
              minWidth: 150,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              borderRadius: 4,
              padding: "10px 12px",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="never">Never</option>
          </select>
        </label>
      </div>

      <fieldset
        className="mt-4"
        style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}
      >
        <legend style={{ color: "var(--muted)", fontSize: 12, padding: "0 6px" }}>Visible folders</legend>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2" style={{ fontSize: 13, color: "var(--ink)" }}>
            <input
              type="radio"
              checked={binderMode === "all"}
              onChange={() => setBinderMode("all")}
            />
            All W binders
          </label>
          <label className="inline-flex items-center gap-2" style={{ fontSize: 13, color: "var(--ink)" }}>
            <input
              type="radio"
              checked={binderMode === "selected"}
              onChange={() => setBinderMode("selected")}
            />
            Selected folders only
          </label>
        </div>

        {binderMode === "selected" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {binderOptions.map((binder) => {
              const checked = selectedBinders.has(binder);
              return (
                <button
                  key={binder}
                  type="button"
                  onClick={() => toggleBinder(binder)}
                  aria-pressed={checked}
                  style={{
                    border: "1px solid var(--border)",
                    background: checked ? "var(--accent)" : "var(--surface-2)",
                    color: checked ? "var(--accent-fg)" : "var(--ink)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {formatBinderForDisplay(binder)}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createLink}
          disabled={pending}
          style={{
            border: "none",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            borderRadius: 4,
            padding: "10px 14px",
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.65 : 1,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {pending ? "Creating…" : "Create private link"}
        </button>
        {message && <span style={{ color: "var(--muted)", fontSize: 12 }}>{message}</span>}
        {error && <span role="alert" style={{ color: "#ef4444", fontSize: 12 }}>{error}</span>}
      </div>

      {createdUrl && (
        <div
          className="mt-4 grid gap-2"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 6,
            padding: 12,
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            New share URL
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <code style={{ color: "var(--ink)", fontSize: 12, overflowWrap: "anywhere", flex: 1 }}>
              {createdUrl}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(createdUrl)}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--ink)",
                borderRadius: 4,
                padding: "8px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-5 grid gap-2">
          {links.map((link) => {
            const status = linkStatus(link);
            return (
              <div
                key={link.id}
                className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"
                style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <strong style={{ color: "var(--ink)", fontSize: 14 }}>{link.label}</strong>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "2px 7px",
                        background: status.active ? "color-mix(in oklab, var(--accent) 20%, transparent)" : "var(--surface-2)",
                        color: status.active ? "var(--accent)" : "var(--muted)",
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11 }}>
                    {link.allowedBinders?.length
                      ? link.allowedBinders.map(formatBinderForDisplay).join(" · ")
                      : "All W binders"} · expires {formatDateTime(link.expiresAt)} · used {link.useCount} {link.useCount === 1 ? "time" : "times"}
                    {link.lastUsedAt ? ` · last used ${formatDateTime(link.lastUsedAt)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revokeLink(link.id)}
                  disabled={!status.active || revokingId === link.id}
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: status.active ? "var(--ink)" : "var(--muted)",
                    borderRadius: 4,
                    padding: "8px 10px",
                    cursor: status.active ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    fontSize: 12,
                    opacity: revokingId === link.id ? 0.65 : 1,
                  }}
                >
                  {revokingId === link.id ? "Revoking…" : status.active ? "Revoke" : "Revoked"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
