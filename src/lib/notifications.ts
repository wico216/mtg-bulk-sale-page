import { Resend } from "resend";
import type { OrderData } from "@/lib/types";
import { buildSellerEmailHtml } from "@/lib/email/seller-email";
import { buildBuyerEmailHtml } from "@/lib/email/buyer-email";
import { logEvent, logError } from "@/lib/logger";

export interface NotifyResult {
  sellerEmailSent: boolean;
  buyerEmailSent: boolean;
}

export const DEFAULT_ORDER_EMAIL_FROM =
  "Wiko's Spellbook <orders@wikospellbinder.com>";

function getOrderEmailFrom(): string {
  return process.env.ORDER_EMAIL_FROM?.trim() || DEFAULT_ORDER_EMAIL_FROM;
}

/**
 * Sends order notification emails via Resend.
 * Seller email is sent first (priority per D-17).
 * Buyer email is best-effort -- failure does not affect order success.
 *
 * Phase 15 review CR-03: the previous `console.log("[ORDER]", JSON.stringify(order))`
 * dumped buyer PII (email, name, free-form message, full item list with prices)
 * to Vercel function logs in plaintext, bypassing the redacting logger. The
 * "backup record" intent (D-18) is satisfied by the `orders` table itself; the
 * log line below preserves the operational signal that a notification was
 * dispatched without echoing PII.
 */
export async function notifyOrder(order: OrderData): Promise<NotifyResult> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sellerEmail = process.env.SELLER_EMAIL;
  const orderEmailFrom = getOrderEmailFrom();
  const result: NotifyResult = { sellerEmailSent: false, buyerEmailSent: false };

  // Operational record: order received for notification dispatch. PII
  // (buyerEmail, buyerName, message, item names/prices) is intentionally omitted.
  // The orders table is the canonical record of the placed order; this log line
  // is just a "notification pipeline saw it" breadcrumb.
  logEvent({
    level: "info",
    event: "notification.order_received",
    route: "lib/notifications",
    metadata: {
      orderRef: order.orderRef,
      totalItems: order.totalItems,
      totalPrice: order.totalPrice,
      itemCount: order.items.length,
    },
  });

  // WR-06: validate SELLER_EMAIL at runtime rather than `sellerEmail!`. If a
  // deploy ships without SELLER_EMAIL, the previous code passed `[undefined]`
  // to Resend, which rejected, the seller branch reported failure, the buyer
  // branch never ran, and the seller never learned about the order even
  // though the order was already committed. Fail fast and log a clear
  // operational signal so the admin health page surfaces the misconfiguration.
  if (!sellerEmail) {
    logError({
      event: "notification.seller_email_unconfigured",
      route: "lib/notifications",
      error: new Error("SELLER_EMAIL is not set"),
      metadata: { orderRef: order.orderRef, totalItems: order.totalItems },
    });
    return result; // Both false; checkout route already handles partial.
  }

  // Send seller email FIRST (priority per D-17)
  const { error: sellerError } = await resend.emails.send({
    from: orderEmailFrom,
    to: [sellerEmail],
    subject: `New order from ${order.buyerName}`,
    html: buildSellerEmailHtml(order),
  });

  if (sellerError) {
    logError({
      event: "notification.seller_email_failed",
      route: "lib/notifications",
      error: sellerError,
      metadata: { orderRef: order.orderRef, totalItems: order.totalItems },
    });
    return result; // Both false -- seller is critical
  }
  result.sellerEmailSent = true;
  logEvent({
    level: "info",
    event: "notification.seller_email_sent",
    route: "lib/notifications",
    metadata: { orderRef: order.orderRef, totalItems: order.totalItems },
  });

  // Send buyer email SECOND (best-effort per D-17)
  try {
    const { error: buyerError } = await resend.emails.send({
      from: orderEmailFrom,
      to: [order.buyerEmail],
      replyTo: sellerEmail, // D-16: buyer replies go to seller (validated above)
      subject: "Your order is confirmed!",
      html: buildBuyerEmailHtml(order),
    });
    if (buyerError) {
      logError({
        event: "notification.buyer_email_failed",
        route: "lib/notifications",
        error: buyerError,
        metadata: { orderRef: order.orderRef },
      });
    } else {
      result.buyerEmailSent = true;
      logEvent({
        level: "info",
        event: "notification.buyer_email_sent",
        route: "lib/notifications",
        metadata: { orderRef: order.orderRef },
      });
    }
  } catch (e) {
    logError({
      event: "notification.buyer_email_failed",
      route: "lib/notifications",
      error: e,
      metadata: { orderRef: order.orderRef },
    });
  }

  return result;
}
