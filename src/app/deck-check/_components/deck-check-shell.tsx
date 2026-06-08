"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import type { DeckCheckItem, DeckCheckOption, DeckCheckResult } from "@/lib/deck-check";
import type { Finish } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatFinish(finish: Finish): string {
  if (finish === "foil") return "Foil";
  if (finish === "etched") return "Etched";
  return "Nonfoil";
}

function formatCondition(condition: string): string {
  return condition
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function optionLabel(option: DeckCheckOption): string {
  const card = option.card;
  const price = formatPrice(card.price);
  return `${card.setCode.toUpperCase()} #${card.collectorNumber} · ${formatFinish(card.finish)} · ${formatCondition(card.condition)} · ${price} · ${card.quantity} available`;
}

function optionShortLabel(option: DeckCheckOption): string {
  const card = option.card;
  return `${card.setCode.toUpperCase()} #${card.collectorNumber} · ${formatFinish(card.finish)}`;
}

function optionImageUrl(option: DeckCheckOption): string | null {
  return option.card.imageUrl ?? option.card.backImageUrl ?? null;
}

function DeckOptionArt({ option, size = "large" }: { option: DeckCheckOption; size?: "large" | "thumb" }) {
  const imageUrl = optionImageUrl(option);
  const className = `wiko-deck-check-option-art wiko-deck-check-option-art-${size}`;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${option.card.name} card art`}
        loading="lazy"
        className={className}
      />
    );
  }

  return (
    <div role="img" aria-label={`${option.card.name} card art unavailable`} className={`${className} wiko-deck-check-art-placeholder`}>
      No image
    </div>
  );
}

function statusColor(status: DeckCheckItem["status"]): string {
  if (status === "exact") return "#22c55e";
  if (status === "alternate") return "#f59e0b";
  if (status === "available") return "var(--accent)";
  return "var(--muted)";
}

function emptySelection(result: DeckCheckResult | null): Record<string, string> {
  if (!result) return {};
  return Object.fromEntries(
    result.items
      .filter((item) => item.recommendedCardId)
      .map((item) => [item.request.id, item.recommendedCardId as string]),
  );
}

function defaultIncluded(result: DeckCheckResult | null): Record<string, boolean> {
  if (!result) return {};
  return Object.fromEntries(
    result.items.map((item) => [item.request.id, item.options.length > 0]),
  );
}

export function DeckCheckShell() {
  const cartItems = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeckCheckResult | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [missingExpanded, setMissingExpanded] = useState(false);
  const [entryExpanded, setEntryExpanded] = useState(true);

  const matchedItems = useMemo(() => {
    if (!result) return [];
    return result.items.filter((item) => item.options.length > 0);
  }, [result]);

  const missingItems = useMemo(() => {
    if (!result) return [];
    return result.items.filter((item) => item.options.length === 0);
  }, [result]);

  const selectedItems = useMemo(() => {
    return matchedItems
      .map((item) => {
        const cardId = selectedCardIds[item.request.id] ?? item.recommendedCardId ?? item.options[0]?.card.id;
        const option = item.options.find((candidate) => candidate.card.id === cardId);
        return option && included[item.request.id] !== false ? { item, option } : null;
      })
      .filter((entry): entry is { item: DeckCheckItem; option: DeckCheckOption } => Boolean(entry));
  }, [included, matchedItems, selectedCardIds]);

  const entryCollapsed = Boolean(result) && !entryExpanded && !checking;

  const selectedEstimate = useMemo(() => {
    if (selectedItems.some(({ option }) => option.card.price == null)) return null;
    return selectedItems.reduce(
      (sum, { option }) => sum + (option.card.price ?? 0) * option.addQuantity,
      0,
    );
  }, [selectedItems]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setError(null);
    setAddedMessage(null);
    setMissingExpanded(false);

    try {
      const response = await fetch("/api/deck-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = (await response.json()) as DeckCheckResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in json && json.error ? json.error : "Could not check that deck.");
      }
      const nextResult = json as DeckCheckResult;
      setResult(nextResult);
      setSelectedCardIds(emptySelection(nextResult));
      setIncluded(defaultIncluded(nextResult));
      setEntryExpanded(false);
    } catch (caught) {
      setEntryExpanded(true);
      setError(caught instanceof Error ? caught.message : "Could not check that deck.");
    } finally {
      setChecking(false);
    }
  }

  function addOption(option: DeckCheckOption) {
    const current = cartItems.get(option.card.id) ?? 0;
    setQuantity(option.card.id, current + option.addQuantity, option.card.quantity);
  }

  function addItem(item: DeckCheckItem) {
    const cardId = selectedCardIds[item.request.id] ?? item.recommendedCardId ?? item.options[0]?.card.id;
    const option = item.options.find((candidate) => candidate.card.id === cardId);
    if (!option) return;
    addOption(option);
    setAddedMessage(`Added ${option.addQuantity} ${item.request.name} to your satchel.`);
  }

  function addAll() {
    for (const { option } of selectedItems) addOption(option);
    const count = selectedItems.reduce((sum, { option }) => sum + option.addQuantity, 0);
    setAddedMessage(`Added ${count} card${count === 1 ? "" : "s"} to your satchel. Review before checkout.`);
  }

  return (
    <main className="wiko-deck-check-page">
      {entryCollapsed ? (
        <section className="wiko-deck-check-collapsed-entry" aria-label="Deck input collapsed">
          <div>
            <p className="wiko-eyebrow">Deck check ready</p>
            <h1 className="wiko-deck-check-collapsed-title">{result?.deckName ?? result?.sourceLabel}</h1>
            <p>
              Showing {matchedItems.length} Spellbook match{matchedItems.length === 1 ? "" : "es"} from {result?.summary.requestedCards ?? 0} checked cards.
            </p>
          </div>
          <button type="button" className="wiko-secondary-button" onClick={() => setEntryExpanded(true)}>
            Edit deck input
          </button>
        </section>
      ) : (
        <>
          <section className="wiko-deck-check-hero">
            <p className="wiko-eyebrow">Deck Match · public Spellbook inventory</p>
            <div className="wiko-deck-check-hero-grid">
              <div>
                <h1 className="wiko-deck-check-title">
                  Check your deck against Wiko&apos;s Spellbook
                  <em>.</em>
                </h1>
                <p className="wiko-deck-check-copy">
                  Paste a Moxfield, Archidekt, or ManaBox link — or paste an exported list.
                  Spellbook will show only cards Wiko currently has available, with a collapsible not-found list at the bottom.
                </p>
              </div>
              <div className="wiko-deck-check-note">
                <strong>Printing-aware:</strong> if your list asks for one version of Counterspell and Wiko has another,
                the row is marked as an alternate printing so you can still add the playable card.
              </div>
            </div>
          </section>

          <section className="wiko-deck-check-panel">
            <form onSubmit={handleSubmit} className="wiko-deck-check-form">
              <label htmlFor="deck-input" className="wiko-deck-check-label">
                Deck link or exported list
              </label>
              <textarea
                id="deck-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={"https://www.moxfield.com/decks/...\n\nor paste:\n1 Sol Ring\n1 Counterspell (DMR) 45\n1 Arcane Signet"}
                rows={8}
                className="wiko-deck-check-input"
              />
              <div className="wiko-deck-check-form-actions">
                <button type="submit" disabled={checking || input.trim().length === 0} className="wiko-primary-button">
                  {checking && <span aria-hidden="true" className="wiko-deck-check-button-spinner" />}
                  {checking ? "Checking…" : result ? "Re-check deck" : "Check my deck"}
                </button>
                <span className="wiko-deck-check-help">
                  ManaBox links are best-effort; pasted/exported lists always work.
                </span>
              </div>
            </form>
          </section>
        </>
      )}

      {checking && (
        <div role="status" aria-live="polite" className="wiko-deck-check-loading">
          <span aria-hidden="true" className="wiko-deck-check-spinner" />
          <div>
            <strong>Checking your deck link against Spellbook…</strong>
            <p>Importing the list, matching exact printings, and finding cards Wiko has on the site.</p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="wiko-deck-check-error">
          {error}
        </div>
      )}

      {result && (
        <section className="wiko-deck-check-results" aria-live="polite">
          <div className="wiko-deck-check-results-head">
            <div>
              <p className="wiko-eyebrow">{result.deckName ?? result.sourceLabel}</p>
              <h2 className="wiko-deck-check-section-title">Spellbook match report</h2>
            </div>
            <div className="wiko-deck-check-actions">
              <button
                type="button"
                onClick={addAll}
                disabled={selectedItems.length === 0}
                className="wiko-primary-button"
              >
                Add all selected to satchel
              </button>
              <Link href="/cart" className="wiko-secondary-link">
                Review satchel
              </Link>
            </div>
          </div>

          <div className="wiko-deck-check-stats">
            <div><strong>{result.summary.requestedCards}</strong><span>cards checked</span></div>
            <div><strong>{result.summary.exactCards}</strong><span>exact</span></div>
            <div><strong>{result.summary.alternateCards}</strong><span>alternate printings</span></div>
            <div><strong>{result.summary.missingCards}</strong><span>missing</span></div>
            <div><strong>{formatPrice(selectedEstimate)}</strong><span>selected est.</span></div>
          </div>

          {result.warnings.length > 0 && (
            <div className="wiko-deck-check-warning">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {addedMessage && (
            <div role="status" className="wiko-deck-check-added">
              {addedMessage} <Link href="/cart">Open satchel</Link>
            </div>
          )}

          <div className="wiko-deck-check-list" aria-label="Cards available on Wiko's Spellbook">
            {matchedItems.length === 0 && (
              <div className="wiko-deck-check-empty">
                No cards from this deck are currently available on Wiko&apos;s Spellbook.
              </div>
            )}
            {matchedItems.map((item) => {
              const fallbackOption = item.options[0];
              const selectedId = selectedCardIds[item.request.id] ?? item.recommendedCardId ?? fallbackOption?.card.id ?? "";
              const selectedOption = item.options.find((option) => option.card.id === selectedId) ?? fallbackOption;
              return (
                <article key={item.request.id} className="wiko-deck-check-row">
                  <div className="wiko-deck-check-row-main">
                    <label className="wiko-deck-check-checkbox">
                      <input
                        type="checkbox"
                        checked={included[item.request.id] !== false}
                        onChange={(event) =>
                          setIncluded((current) => ({
                            ...current,
                            [item.request.id]: event.target.checked,
                          }))
                        }
                      />
                      <span className="sr-only">Include {item.request.name}</span>
                    </label>
                    {selectedOption && <DeckOptionArt option={selectedOption} />}
                    <div>
                      <div className="wiko-deck-check-card-line">
                        <strong>{item.request.quantity}× {item.request.name}</strong>
                        <span style={{ color: statusColor(item.status) }}>{item.statusLabel}</span>
                      </div>
                      <p className="wiko-deck-check-requested">
                        Requested {item.requestedPrintingLabel ?? "any printing"}
                        {item.request.section !== "main" ? ` · ${item.request.section}` : ""}
                      </p>
                      {selectedOption && (
                        <>
                          <p className="wiko-deck-check-match-reason">{selectedOption.reason}</p>
                          <p className="wiko-deck-check-match-reason">Selected: {optionLabel(selectedOption)}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="wiko-deck-check-row-actions">
                    <div className="wiko-deck-check-option-picker" aria-label={`Available Spellbook versions for ${item.request.name}`}>
                      {item.options.map((option) => {
                        const optionSelected = option.card.id === selectedId;
                        return (
                          <button
                            key={option.card.id}
                            type="button"
                            className={`wiko-deck-check-option-card${optionSelected ? " is-selected" : ""}`}
                            aria-pressed={optionSelected}
                            aria-label={`Select ${option.card.name} ${optionShortLabel(option)}`}
                            onClick={() =>
                              setSelectedCardIds((current) => ({
                                ...current,
                                [item.request.id]: option.card.id,
                              }))
                            }
                          >
                            <DeckOptionArt option={option} size="thumb" />
                            <span className="wiko-deck-check-option-meta">
                              <strong>{optionShortLabel(option)}</strong>
                              <span>{formatCondition(option.card.condition)} · {formatPrice(option.card.price)}</span>
                              <span>{option.addQuantity} of {option.card.quantity} available</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => addItem(item)} className="wiko-secondary-button">
                      Add {selectedOption?.addQuantity ?? 1}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {missingItems.length > 0 && (
            <section className="wiko-deck-check-missing-panel" aria-label="Cards not found in Spellbook">
              <button
                type="button"
                className="wiko-deck-check-missing-toggle"
                aria-expanded={missingExpanded}
                onClick={() => setMissingExpanded((expanded) => !expanded)}
              >
                <span>Cards not found in Spellbook</span>
                <strong>{missingItems.length}</strong>
                <span aria-hidden="true">{missingExpanded ? "−" : "+"}</span>
              </button>
              {missingExpanded && (
                <div className="wiko-deck-check-missing-list">
                  {missingItems.map((item) => (
                    <article key={item.request.id} className="wiko-deck-check-missing-row">
                      <div className="wiko-deck-check-card-line">
                        <strong>{item.request.quantity}× {item.request.name}</strong>
                        <span style={{ color: statusColor(item.status) }}>{item.statusLabel}</span>
                      </div>
                      <p className="wiko-deck-check-missing">
                        Requested {item.requestedPrintingLabel ?? "any printing"}
                        {item.request.section !== "main" ? ` · ${item.request.section}` : ""} · Wiko does not currently have this in the public Spellbook.
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      )}
    </main>
  );
}
