// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: ComponentProps<"a"> & { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AuditTable } from "../audit-table";
import type {
  AdminAuditEntriesResult,
  AdminAuditEntry,
} from "@/db/queries";

function makeImportCommitEntry(
  overrides: Partial<AdminAuditEntry> = {},
): AdminAuditEntry {
  return {
    id: 1,
    action: "inventory.import_commit",
    actorEmail: "admin@example.com",
    targetType: "import",
    targetId: null,
    targetCount: 109,
    metadata: {
      selectedBinders: ["a07", "foundation_box", "lord_of_the_rings"],
      totalBindersInExport: 5,
      scopedReplaceCounts: {
        before: { a07: 0, foundation_box: 470, lord_of_the_rings: 320 },
        after: { a07: 109, foundation_box: 470, lord_of_the_rings: 320 },
        deletedFromUnselected: 0,
      },
      totalCardsAfterImport: 12749,
      newBindersInExport: ["a14"],
      missingBindersFromExport: [],
    },
    createdAt: "2026-05-11T12:00:00.000Z",
    ...overrides,
  };
}

function makeUpdateEntry(
  overrides: Partial<AdminAuditEntry> = {},
): AdminAuditEntry {
  return {
    id: 2,
    action: "inventory.update",
    actorEmail: "admin@example.com",
    targetType: "card",
    targetId: "sld-123-normal-near_mint-a02",
    targetCount: null,
    metadata: { field: "price", from: 0.5, to: 0.75 },
    createdAt: "2026-05-11T11:00:00.000Z",
    ...overrides,
  };
}

function makeResult(entries: AdminAuditEntry[]): AdminAuditEntriesResult {
  return { entries, total: entries.length, page: 1, limit: 25, totalPages: 1 };
}

describe("AuditTable inventory.import_commit expander (Phase 21 Plan 02 Task 5)", () => {
  it("renders inventory.import_commit row collapsed by default with summary (D-10)", () => {
    render(
      <AuditTable
        result={makeResult([makeImportCommitEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText(/Replaced 3 binders/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show details/i }),
    ).toBeInTheDocument();
    // Expanded section heading absent in collapsed view.
    expect(
      screen.queryByText(/Selected binders \(3\)/),
    ).not.toBeInTheDocument();
  });

  it("expands to show all five metadata sections on Show details click (D-10)", async () => {
    const user = userEvent.setup();
    render(
      <AuditTable
        result={makeResult([makeImportCommitEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText(/Selected binders \(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/^New:/)).toBeInTheDocument();
    expect(screen.getByText(/^Missing:/)).toBeInTheDocument();
    expect(screen.getByText(/Per-binder counts/)).toBeInTheDocument();
    expect(screen.getByText(/Total inventory after/)).toBeInTheDocument();
  });

  it("toggles back to collapsed on Hide details click (D-10)", async () => {
    const user = userEvent.setup();
    render(
      <AuditTable
        result={makeResult([makeImportCommitEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /show details/i }));
    await user.click(screen.getByRole("button", { name: /hide details/i }));
    expect(
      screen.getByRole("button", { name: /show details/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Selected binders \(3\)/),
    ).not.toBeInTheDocument();
  });

  it("renders per-binder before → after counts with arrow character (D-10)", async () => {
    const user = userEvent.setup();
    render(
      <AuditTable
        result={makeResult([makeImportCommitEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText(/a07: 0 → 109/)).toBeInTheDocument();
    expect(screen.getByText(/foundation_box: 470 → 470/)).toBeInTheDocument();
  });

  it("renders Missing: (none) when missingBindersFromExport is empty (D-10)", async () => {
    const user = userEvent.setup();
    render(
      <AuditTable
        result={makeResult([makeImportCommitEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText(/\(none\)/)).toBeInTheDocument();
    // Tighter assertion: the "Missing:" line ends with "(none)".
    const missingLine = screen.getByText(/^Missing:/).parentElement;
    expect(missingLine?.textContent).toMatch(/Missing:\s*\(none\)/);
  });

  it("renders New: (none) when newBindersInExport is empty (D-10)", async () => {
    const user = userEvent.setup();
    const entry = makeImportCommitEntry({
      metadata: {
        ...makeImportCommitEntry().metadata,
        newBindersInExport: [],
      },
    });
    render(
      <AuditTable
        result={makeResult([entry])}
        currentParams={new URLSearchParams()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /show details/i }));
    const newLine = screen.getByText(/^New:/).parentElement;
    expect(newLine?.textContent).toMatch(/New:\s*\(none\)/);
  });

  it("non-import_commit rows keep existing metadataPreview rendering (D-11)", () => {
    render(
      <AuditTable
        result={makeResult([makeUpdateEntry()])}
        currentParams={new URLSearchParams()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /show details/i }),
    ).not.toBeInTheDocument();
    // metadataPreview formats as "field: price · from: 0.5 · to: 0.75".
    expect(screen.getByText(/field: price/)).toBeInTheDocument();
  });

  it("legacy import_commit row missing scopedReplaceCounts falls back to preview (graceful degradation)", () => {
    const legacy = makeImportCommitEntry({
      metadata: { insertedCards: 50 }, // pre-Phase 19 metadata shape
    });
    render(
      <AuditTable
        result={makeResult([legacy])}
        currentParams={new URLSearchParams()}
      />,
    );
    // No expander button on legacy rows.
    expect(
      screen.queryByRole("button", { name: /show details/i }),
    ).not.toBeInTheDocument();
    // The fallback render shows the legacy field.
    expect(screen.getByText(/insertedCards: 50/)).toBeInTheDocument();
  });
});
