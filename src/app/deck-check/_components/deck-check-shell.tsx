"use client";

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

  const selectedItems = useMemo(() => {
    if (!result) return [];
    return result.items
      .map((item) => {
        const cardId = selectedCardIds[item.request.id];
        const option = item.options.find((candidate) => candidate.card.id === cardId);
        return option && included[item.request.id] !== false ? { item, option } : null;
      })
      .filter((entry): entry is { item: DeckCheckItem; option: DeckCheckOption } => Boolean(entry));
  }, [included, result, selectedCardIds]);

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
    } catch (caught) {
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
    const cardId = selectedCardIds[item.request.id];
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
              Spellbook will show exact matches, alternate printings, and cards Wiko does not currently have.
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
              {checking ? "Checking…" : "Check my deck"}
            </button>
            <span className="wiko-deck-check-help">
              ManaBox links are best-effort; pasted/exported lists always work.
            </span>
          </div>
        </form>
      </section>

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

          <div className="wiko-deck-check-list">
            {result.items.map((item) => {
              const selectedId = selectedCardIds[item.request.id] ?? "";
              const selectedOption = item.options.find((option) => option.card.id === selectedId);
              return (
                <article key={item.request.id} className="wiko-deck-check-row">
                  <div className="wiko-deck-check-row-main">
                    <label className="wiko-deck-check-checkbox">
                      <input
                        type="checkbox"
                        checked={included[item.request.id] !== false && item.options.length > 0}
                        disabled={item.options.length === 0}
                        onChange={(event) =>
                          setIncluded((current) => ({
                            ...current,
                            [item.request.id]: event.target.checked,
                          }))
                        }
                      />
                      <span className="sr-only">Include {item.request.name}</span>
                    </label>
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
                        <p className="wiko-deck-check-match-reason">{selectedOption.reason}</p>
                      )}
                      {item.options.length === 0 && (
                        <p className="wiko-deck-check-missing">Wiko does not currently have this in the public Spellbook.</p>
                      )}
                    </div>
                  </div>

                  {item.options.length > 0 && (
                    <div className="wiko-deck-check-row-actions">
                      <select
                        value={selectedId}
                        onChange={(event) =>
                          setSelectedCardIds((current) => ({
                            ...current,
                            [item.request.id]: event.target.value,
                          }))
                        }
                        aria-label={`Choose Spellbook version for ${item.request.name}`}
                      >
                        {item.options.map((option) => (
                          <option key={option.card.id} value={option.card.id}>
                            {option.recommended ? "Recommended · " : ""}{optionLabel(option)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => addItem(item)} className="wiko-secondary-button">
                        Add {selectedOption?.addQuantity ?? 1}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
