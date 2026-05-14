"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  CONDITION_OPTIONS,
  conditionToAbbr,
} from "@/lib/condition-map";

interface EditableCellProps {
  value: string | number;
  cardId: string;
  field: "price" | "quantity" | "condition";
  cardName: string;
  onSave: (
    cardId: string,
    field: string,
    value: string | number,
  ) => Promise<boolean>;
  onError: (message: string) => void;
}

export function EditableCell({
  value,
  cardId,
  field,
  cardName,
  onSave,
  onError,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const savingRef = useRef(false);

  // Keep displayValue in sync with incoming value prop
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;

    let newValue: string | number = editValue;
    if (field === "price") {
      const parsed = parseFloat(editValue);
      if (isNaN(parsed) || parsed < 0) {
        onError("Enter a valid price");
        setShowError(true);
        setTimeout(() => setShowError(false), 2000);
        setEditing(false);
        setEditValue(String(displayValue));
        return;
      }
      newValue = parsed;
    } else if (field === "quantity") {
      const parsed = parseInt(editValue, 10);
      if (isNaN(parsed) || parsed < 0) {
        onError("Enter a valid quantity");
        setShowError(true);
        setTimeout(() => setShowError(false), 2000);
        setEditing(false);
        setEditValue(String(displayValue));
        return;
      }
      newValue = parsed;
    }

    // Skip save if value didn't change
    if (String(newValue) === String(displayValue)) {
      setEditing(false);
      return;
    }

    // Optimistic update
    const previousValue = displayValue;
    setDisplayValue(newValue);
    setEditing(false);
    setSaving(true);
    savingRef.current = true;

    try {
      const success = await onSave(cardId, field, newValue);
      if (success) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      } else {
        setDisplayValue(previousValue);
        setEditValue(String(previousValue));
        onError("Failed to save changes. Try again.");
        setShowError(true);
        setTimeout(() => setShowError(false), 2000);
      }
    } catch {
      setDisplayValue(previousValue);
      setEditValue(String(previousValue));
      onError("Failed to save changes. Try again.");
      setShowError(true);
      setTimeout(() => setShowError(false), 2000);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [editValue, field, displayValue, onSave, cardId, onError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setEditValue(String(displayValue));
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  const ariaLabel = `${field.charAt(0).toUpperCase() + field.slice(1)} for ${cardName}`;

  if (editing) {
    if (field === "condition") {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          className="rounded px-2 py-1 text-sm focus:outline-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent)",
            color: "var(--ink)",
          }}
        >
          {CONDITION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className="flex items-center gap-1">
        {field === "price" && (
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            $
          </span>
        )}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          step={field === "price" ? "0.01" : "1"}
          min="0"
          aria-label={ariaLabel}
          className={`${field === "price" ? "w-20" : "w-16"} rounded px-2 py-1 text-sm focus:outline-none tabular-nums`}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent)",
            color: "var(--ink)",
          }}
        />
      </div>
    );
  }

  const formattedValue =
    field === "price"
      ? displayValue !== null && displayValue !== undefined
        ? `$${Number(displayValue).toFixed(2)}`
        : "N/A"
      : field === "condition"
        ? conditionToAbbr(String(displayValue))
        : String(displayValue);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!saving) {
          const initValue =
            field === "condition"
              ? conditionToAbbr(String(displayValue))
              : String(displayValue);
          setEditValue(initValue);
          setEditing(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !saving) {
          const initValue =
            field === "condition"
              ? conditionToAbbr(String(displayValue))
              : String(displayValue);
          setEditValue(initValue);
          setEditing(true);
        }
      }}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 cursor-pointer rounded px-1.5 -mx-1.5 py-0.5 transition-colors duration-300 ${
        saving ? "opacity-70" : ""
      }`}
      style={{
        background: showSuccess
          ? "color-mix(in oklab, var(--accent) 18%, transparent)"
          : showError
          ? "rgb(220 38 38 / 0.15)"
          : "transparent",
        border: showError
          ? "1px solid rgb(220 38 38)"
          : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!saving && !showSuccess && !showError) {
          e.currentTarget.style.background = "color-mix(in oklab, var(--ink) 6%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!showSuccess && !showError) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <span className="tabular-nums">{formattedValue}</span>
      {showSuccess && (
        <svg
          className="w-3.5 h-3.5 transition-opacity duration-300"
          style={{ color: "var(--accent)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
    </div>
  );
}
