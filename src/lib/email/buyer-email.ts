import type { OrderData } from "@/lib/types";
import { escapeHtml } from "@/lib/order";

/**
 * Builds the HTML email sent to the buyer as order confirmation.
 * Includes order summary, item table, total, and pay-in-person note.
 */
export function buildBuyerEmailHtml(order: OrderData): string {
  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717;">
          ${escapeHtml(item.name)}<br/>
          <span style="font-size: 12px; color: #71717a;">${escapeHtml(item.setName)} (${escapeHtml(item.setCode.toUpperCase())}) #${escapeHtml(item.collectorNumber)}</span>
        </td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #171717; text-align: right;">${item.lineTotal !== null ? `$${item.lineTotal.toFixed(2)}` : "N/A"}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 0; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; font-family: Arial, Helvetica, sans-serif;">
    <div style="padding: 16px 24px; border-bottom: 2px solid #4f46e5;">
      <span style="font-size: 14px; font-weight: bold; color: #4f46e5;">Viki MTG Store</span>
    </div>
    <div style="padding: 24px;">
      <h1 style="font-size: 20px; font-weight: bold; color: #171717; margin: 0 0 16px;">Thanks for your order, ${escapeHtml(order.buyerName)}!</h1>
      <p style="color: #171717; margin: 4px 0;"><strong>Order:</strong> ${order.orderRef}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
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
      </table>
      <p style="color: #171717; font-weight: bold; text-align: right; margin: 16px 0;">Total: $${order.totalPrice.toFixed(2)} (${order.totalItems} items)</p>
      <p style="color: #71717a; font-size: 14px; margin: 16px 0;">No payment needed online -- just pay when you pick up. We'll have your cards ready!</p>
    </div>
  </div>
</body>
</html>`;
}
