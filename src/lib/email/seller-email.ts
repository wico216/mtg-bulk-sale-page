import type { OrderData, OrderItem } from "@/lib/types";
import { escapeHtml } from "@/lib/order";

// Display-formats a stored binder name (lowercase, e.g. "a10", "unsorted") for
// the seller email. Binder codes that mix letters then digits ("a10") get the
// letter run upper-cased so they read as "A10" — matches how the operator
// labels physical binders. Pure-word names like "unsorted" get title-cased so
// they read as "Unsorted" (we don't want "UNSORTED" shouting in the email).
function formatBinderForDisplay(binder: string): string {
  if (!binder) return "Unsorted";
  const match = binder.match(/^([a-z]+)(\d.*)$/i);
  if (match) return match[1].toUpperCase() + match[2];
  return binder.charAt(0).toUpperCase() + binder.slice(1);
}

function renderItemRow(item: OrderItem): string {
  return `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717;">
          ${escapeHtml(item.name)}<br/>
          <span style="font-size: 12px; color: #71717a;">${escapeHtml(item.setName)} (${escapeHtml(item.setCode.toUpperCase())}) #${escapeHtml(item.collectorNumber)} · ${escapeHtml(item.condition)}</span>
        </td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: right;">${item.lineTotal !== null ? `$${item.lineTotal.toFixed(2)}` : "N/A"}</td>
      </tr>`;
}

function renderBinderSection(binder: string, items: OrderItem[]): string {
  const itemRows = items.map(renderItemRow).join("");
  const binderItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return `
      <h2 style="font-size: 16px; font-weight: bold; color: #171717; margin: 24px 0 8px; padding: 8px 12px; background: #eef2ff; border-left: 4px solid #4f46e5;">
        ${escapeHtml(formatBinderForDisplay(binder))} <span style="font-weight: normal; color: #71717a; font-size: 13px;">(${binderItemCount} ${binderItemCount === 1 ? "card" : "cards"})</span>
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 8px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: left;">Card</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: center;">Qty</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>`;
}

/**
 * Builds the HTML email sent to the seller when a new order is placed.
 * Includes buyer contact info, optional message, and an item table grouped by
 * binder (one section per binder) so the seller can walk binder-by-binder when
 * pulling cards. Binder names are display-formatted (stored "a10" → shown
 * "A10") to match the operator's physical binder labels.
 */
export function buildSellerEmailHtml(order: OrderData): string {
  // Group items by stored binder name. Map preserves insertion order, but we
  // sort the keys before rendering so the email order is deterministic
  // regardless of cart insertion order — also produces A01, A02, A03... order
  // for the operator's actual collection.
  const byBinder = new Map<string, OrderItem[]>();
  for (const item of order.items) {
    const list = byBinder.get(item.binder) ?? [];
    list.push(item);
    byBinder.set(item.binder, list);
  }
  const sortedBinders = [...byBinder.keys()].sort();
  const binderSections = sortedBinders
    .map((b) => renderBinderSection(b, byBinder.get(b)!))
    .join("");

  const messageLine = order.message
    ? `<p style="color: #171717; margin: 4px 0;"><strong>Note:</strong> ${escapeHtml(order.message)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 0; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; font-family: Arial, Helvetica, sans-serif;">
    <div style="padding: 16px 24px; border-bottom: 2px solid #4f46e5;">
      <span style="font-size: 14px; font-weight: bold; color: #4f46e5;">Wiko's Spellbook</span>
    </div>
    <div style="padding: 24px;">
      <h1 style="font-size: 20px; font-weight: bold; color: #171717; margin: 0 0 16px;">New order from ${escapeHtml(order.buyerName)}</h1>
      <p style="color: #171717; margin: 4px 0;"><strong>Order:</strong> ${order.orderRef}</p>
      <p style="color: #171717; margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(order.buyerEmail)}</p>
      ${messageLine}
      ${binderSections}
      <p style="color: #171717; font-weight: bold; text-align: right; margin: 16px 0;">Total: $${order.totalPrice.toFixed(2)} (${order.totalItems} items)</p>
    </div>
  </div>
</body>
</html>`;
}
