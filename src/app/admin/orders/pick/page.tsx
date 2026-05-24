import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOrdersByIds, type AdminOrderDetail } from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import {
  e2eFixtureAdminOrderDetails,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { PickBatchClient, type PickRow } from "./_components/pick-batch-client";

export const metadata: Metadata = {
  title: "Pick batch — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse `?refs=ORD-1,ORD-2,...` into a deduped list of order references.
 * Empty / missing returns []. Invalid characters are tolerated — the
 * downstream `getOrdersByIds` will simply drop unknown ids.
 */
function parseRefs(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
}

/**
 * Flatten the picker payload: one row per OrderItem, decorated with the
 * source order ref. The picker groups + sorts on the client, but does so
 * over an already-flat list so the group derivation stays cheap.
 */
function flattenPickerRows(orders: AdminOrderDetail[]): PickRow[] {
  const rows: PickRow[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      rows.push({
        // Picker-row id: order ref + cardId. Stable across re-renders;
        // distinct even when two different orders carry the same cardId
        // (the picker needs to track them separately so each order's
        // pick state is independent).
        id: `${order.orderRef}::${item.cardId}`,
        orderRef: order.orderRef,
        cardId: item.cardId,
        name: item.name,
        setCode: item.setCode,
        collectorNumber: item.collectorNumber,
        condition: item.condition,
        binder: item.binder,
        quantity: item.quantity,
        price: item.price,
        imageUrl: item.imageUrl ?? null,
      });
    }
  }
  return rows;
}

export default async function PickBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const fixtureMode = e2eFixturesEnabled();
  if (!fixtureMode) {
    const session = await auth();
    if (!session?.user) redirect("/admin/login");
    if (!isAdminEmail(session.user.email)) redirect("/admin/access-denied");
  }

  const resolved = await searchParams;
  const refs = parseRefs(firstParam(resolved.refs));

  if (refs.length === 0) {
    return (
      <div className="space-y-6 pt-4">
        <h1
          className="m-0"
          style={{
            fontFamily:
              "var(--font-instrument-serif), ui-serif, Georgia, serif",
            fontWeight: 400,
            fontSize: 36,
            color: "var(--ink)",
          }}
        >
          Pick batch
          <em style={{ fontStyle: "italic", color: "var(--accent)" }}>.</em>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          No orders selected. Go back to{" "}
          <Link
            href="/admin/orders"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            Orders
          </Link>{" "}
          and check one or more rows.
        </p>
      </div>
    );
  }

  const orders = fixtureMode
    ? e2eFixtureAdminOrderDetails.filter((order) => refs.includes(order.orderRef))
    : await getOrdersByIds(refs);
  const missing = refs.filter((r) => !orders.some((o) => o.orderRef === r));

  // Only orders that can actually be advanced get included in the picker
  // payload. A `completed` or `cancelled` order in the selection is a UI
  // mistake — surface it as a notice rather than silently dropping it.
  const advanceable = orders.filter(
    (o) => o.status === "pending" || o.status === "confirmed",
  );
  const skipped = orders.filter(
    (o) => o.status !== "pending" && o.status !== "confirmed",
  );

  const rows = flattenPickerRows(advanceable);

  const totalCopies = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <PickBatchClient
      rows={rows}
      orderRefs={advanceable.map((o) => o.orderRef)}
      totals={{
        orders: advanceable.length,
        cards: rows.length,
        copies: totalCopies,
      }}
      missing={missing}
      skipped={skipped.map((o) => ({ ref: o.orderRef, status: o.status }))}
    />
  );
}
