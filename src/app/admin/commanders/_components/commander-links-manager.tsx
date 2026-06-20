"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CommanderLink, CommanderSearchResult } from "@/lib/commander-links-types";

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

interface CommanderSearchResponse {
  results: CommanderSearchResult[];
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--ink)",
  borderRadius: 4,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 6px",
  color: "var(--muted)",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
};

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

function CommanderResultImage({ result }: { result: CommanderSearchResult }) {
  if (!result.imageUrl) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 60,
          borderRadius: 6,
          border: "1px solid var(--border)",
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--accent) 25%, transparent), var(--surface))",
          flex: "0 0 auto",
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Scryfall result thumbnails are remote admin-only previews.
    <img
      src={result.imageUrl}
      alt=""
      loading="lazy"
      aria-hidden="true"
      style={{
        width: 44,
        height: 60,
        objectFit: "cover",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        flex: "0 0 auto",
      }}
    />
  );
}

function formatColorIdentity(colors: string[]): string {
  return colors.length > 0 ? colors.join("") : "Colorless";
}

export function CommanderLinksManager({ initialCommanders }: CommanderLinksManagerProps) {
  const [commanders, setCommanders] = useState(initialCommanders);
  const [name, setName] = useState("");
  const [selectedCommander, setSelectedCommander] = useState<CommanderSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<CommanderSearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [edhrecUrl, setEdhrecUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2 || selectedCommander?.name === query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchPending(false);
      setSearchOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchPending(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/admin/commander-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response));
        const body = (await response.json()) as CommanderSearchResponse;
        if (controller.signal.aborted) return;
        setSearchResults(body.results ?? []);
        setSearchOpen(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchOpen(false);
        setSearchError(err instanceof Error ? err.message : "Failed to search Scryfall");
      } finally {
        if (!controller.signal.aborted) setSearchPending(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [name, selectedCommander?.name]);

  const selectCommander = (result: CommanderSearchResult) => {
    setSelectedCommander(result);
    setName(result.name);
    setEdhrecUrl(result.edhrecUrl);
    setImageUrl(result.imageUrl ?? "");
    setSearchResults([]);
    setSearchOpen(false);
    setSearchError(null);
    setMessage(null);
    setError(null);
  };

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
          edhrecUrl: edhrecUrl.trim() || undefined,
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
      setSelectedCommander(null);
      setSearchResults([]);
      setSearchOpen(false);
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

  const canCreate = name.trim().length > 0 && !pending;

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
            <p style={eyebrowStyle}>Add shortcut</p>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>
              Commander EDHREC links
            </h2>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, maxWidth: 760 }}>
              Search Scryfall, choose your commander, and Spellbook will fill the EDHREC link and card art automatically.
            </p>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {commanders.length} saved
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)", position: "relative" }}>
            Commander search
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSelectedCommander(null);
                setEdhrecUrl("");
                setImageUrl("");
              }}
              onFocus={() => {
                if (searchResults.length > 0) setSearchOpen(true);
              }}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
              placeholder="Start typing: Muldrotha, Atraxa, Prosper…"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls="commander-search-results"
              aria-label="Commander search"
              style={inputStyle}
            />
            {selectedCommander && (
              <span style={{ color: "var(--accent)", fontSize: 11 }}>
                Selected from Scryfall · {formatColorIdentity(selectedCommander.colorIdentity)}
              </span>
            )}
            {!selectedCommander && searchPending && (
              <span style={{ color: "var(--muted)", fontSize: 11 }}>Searching Scryfall…</span>
            )}
            {!selectedCommander && searchError && (
              <span role="alert" style={{ color: "#ef4444", fontSize: 11 }}>{searchError}</span>
            )}
            {!selectedCommander && name.trim().length > 0 && name.trim().length < 2 && (
              <span style={{ color: "var(--muted)", fontSize: 11 }}>Type at least 2 characters to search.</span>
            )}

            {searchOpen && searchResults.length > 0 && (
              <div
                id="commander-search-results"
                role="listbox"
                aria-label="Commander search results"
                style={{
                  position: "absolute",
                  zIndex: 30,
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 6,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--bg)",
                  boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
                  overflow: "hidden",
                }}
              >
                {searchResults.map((result) => (
                  <button
                    key={`${result.scryfallId ?? result.name}-${result.edhrecUrl}`}
                    type="button"
                    role="option"
                    aria-selected={selectedCommander?.name === result.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectCommander(result)}
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <CommanderResultImage result={result} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: 13, lineHeight: 1.25 }}>{result.name}</strong>
                      <span style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 3 }}>
                        {result.typeLine ?? "Commander"} · {formatColorIdentity(result.colorIdentity)}
                      </span>
                      <span style={{ display: "block", color: "var(--accent)", fontSize: 11, marginTop: 3 }}>
                        Auto-link: {result.edhrecUrl.replace("https://", "")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            EDHREC URL · auto-filled
            <input
              value={edhrecUrl}
              onChange={(event) => setEdhrecUrl(event.target.value)}
              placeholder="Choose a commander, or leave blank to generate on save"
              inputMode="url"
              style={inputStyle}
            />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              You can still override this if EDHREC uses a special page.
            </span>
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            Image URL · auto-filled
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="Choose a commander, or leave blank for Scryfall art"
              inputMode="url"
              style={inputStyle}
            />
          </label>

          <button
            type="button"
            disabled={!canCreate}
            onClick={createCommander}
            style={{
              border: "none",
              borderRadius: 4,
              background: canCreate ? "var(--accent)" : "var(--muted)",
              color: "var(--accent-fg)",
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: canCreate ? "pointer" : "not-allowed",
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
          No commanders saved yet. Search for your first commander above.
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
