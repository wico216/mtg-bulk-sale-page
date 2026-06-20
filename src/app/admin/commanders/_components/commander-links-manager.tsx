"use client";

import { useState } from "react";
import type { CommanderLink } from "@/lib/commander-links-types";

interface CommanderLinksManagerProps {
  initialCommanders: CommanderLink[];
}

interface CreateCommanderResponse {
  success: true;
  commander: CommanderLink;
}

interface DeleteCommanderResponse {
  success: true;
  commander: CommanderLink;
}

function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : "Request failed";
  } catch {
    return "Request failed";
  }
}

function CommanderImage({ commander }: { commander: CommanderLink }) {
  if (!commander.imageUrl) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "5 / 7",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--accent) 28%, transparent), var(--surface))",
          color: "var(--muted)",
          display: "grid",
          placeItems: "center",
          padding: 18,
          textAlign: "center",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        }}
      >
        Open EDHREC
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Admin-only shortcut cards can use arbitrary saved image URLs.
    <img
      src={commander.imageUrl}
      alt={`${commander.name} commander art`}
      loading="lazy"
      style={{
        width: "100%",
        aspectRatio: "5 / 7",
        objectFit: "cover",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        display: "block",
      }}
    />
  );
}

export function CommanderLinksManager({ initialCommanders }: CommanderLinksManagerProps) {
  const [commanders, setCommanders] = useState(initialCommanders);
  const [name, setName] = useState("");
  const [edhrecUrl, setEdhrecUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const createCommander = async () => {
    setError(null);
    setMessage(null);

    setPending(true);
    try {
      const response = await fetch("/api/admin/commander-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          edhrecUrl,
          imageUrl: imageUrl.trim() || undefined,
        }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as CreateCommanderResponse;
      setCommanders((current) =>
        [...current, body.commander].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setName("");
      setEdhrecUrl("");
      setImageUrl("");
      setMessage("Commander shortcut saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save commander");
    } finally {
      setPending(false);
    }
  };

  const deleteCommander = async (id: number) => {
    setError(null);
    setMessage(null);
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/commander-links/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as DeleteCommanderResponse;
      setCommanders((current) => current.filter((commander) => commander.id !== body.commander.id));
      setMessage("Commander shortcut removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove commander");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 12,
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
              Add shortcut
            </p>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>
              Commander EDHREC links
            </h2>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, maxWidth: 760 }}>
              Paste the EDHREC page for a commander. Leave image blank and Spellbook will try to pull the commander art from Scryfall.
            </p>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {commanders.length} saved
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            Commander name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Muldrotha, the Gravetide"
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
            EDHREC URL
            <input
              value={edhrecUrl}
              onChange={(event) => setEdhrecUrl(event.target.value)}
              placeholder="https://edhrec.com/commanders/muldrotha-the-gravetide"
              inputMode="url"
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
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            Image URL · optional
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="Leave blank to auto-fill from Scryfall"
              inputMode="url"
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

          <button
            type="button"
            disabled={pending}
            onClick={createCommander}
            style={{
              border: "none",
              borderRadius: 4,
              background: pending ? "var(--muted)" : "var(--accent)",
              color: "var(--accent-fg)",
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: pending ? "not-allowed" : "pointer",
              minHeight: 42,
            }}
          >
            {pending ? "Saving…" : "Add commander"}
          </button>
        </div>

        {message && <p role="status" className="mt-3 text-sm text-emerald-500">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
      </section>

      {commanders.length === 0 ? (
        <section
          style={{
            border: "1px dashed var(--border)",
            borderRadius: 12,
            padding: 28,
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          No commanders saved yet. Add your first EDHREC shortcut above.
        </section>
      ) : (
        <section
          className="wiko-commander-link-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
          aria-label="Saved Commander EDHREC links"
        >
          {commanders.map((commander) => (
            <article
              key={commander.id}
              aria-label={`${commander.name} commander shortcut`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--bg)",
                padding: 12,
                boxShadow: "0 14px 38px rgba(0,0,0,0.08)",
              }}
            >
              <a
                href={commander.edhrecUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${commander.name} on EDHREC`}
                style={{ display: "block", color: "inherit", textDecoration: "none" }}
              >
                <CommanderImage commander={commander} />
              </a>

              <div className="mt-3 space-y-2">
                <div>
                  <h3 style={{ margin: 0, color: "var(--ink)", fontSize: 15, lineHeight: 1.25 }}>
                    {commander.name}
                  </h3>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "var(--muted)",
                      fontSize: 11,
                      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    }}
                  >
                    Saved {formatDate(commander.createdAt)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <a
                    href={commander.edhrecUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)", fontSize: 12, fontWeight: 700 }}
                  >
                    Open EDHREC
                  </a>
                  <button
                    type="button"
                    disabled={deletingId === commander.id}
                    onClick={() => deleteCommander(commander.id)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      background: "transparent",
                      color: "var(--muted)",
                      padding: "6px 8px",
                      fontSize: 11,
                      cursor: deletingId === commander.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingId === commander.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
