import { Resend } from "resend";
import type { OrderData } from "@/lib/types";
import { buildSellerEmailHtml } from "@/lib/email/seller-email";
import { buildBuyerEmailHtml } from "@/lib/email/buyer-email";

export interface NotifyResult {
  sellerEmailSent: boolean;
  buyerEmailSent: boolean;
}

/**
 * Sends order notification emails via Resend.
 * Seller email is sent first (priority per D-17).
 * Buyer email is best-effort -- failure does not affect order success.
 * Order data is logged to console as backup record (D-18).
 */
export async function notifyOrder(order: OrderData): Promise<NotifyResult> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sellerEmail = process.env.SELLER_EMAIL;
  const result: NotifyResult = { sellerEmailSent: false, buyerEmailSent: false };

  // Log order data to Vercel function logs (D-18: backup record)
  console.log("[ORDER]", JSON.stringify(order));

  // Send seller email FIRST (priority per D-17)
  const { error: sellerError } = await resend.emails.send({
    from: "Viki MTG Store <onboarding@resend.dev>",
    to: [sellerEmail!],
    subject: `New order from ${order.buyerName}`,
    html: buildSellerEmailHtml(order),
  });

  if (sellerError) {
    console.error("[ORDER] Seller email failed:", sellerError);
    return result; // Both false -- seller is critical
  }
  result.sellerEmailSent = true;

  // Send buyer email SECOND (best-effort per D-17)
  try {
    const { error: buyerError } = await resend.emails.send({
      from: "Viki MTG Store <onboarding@resend.dev>",
      to: [order.buyerEmail],
      replyTo: sellerEmail!, // D-16: buyer replies go to seller
      subject: "Your order is confirmed!",
      html: buildBuyerEmailHtml(order),
    });
    if (buyerError) {
      console.error("[ORDER] Buyer email failed (non-critical):", buyerError);
    } else {
      result.buyerEmailSent = true;
    }
  } catch (e) {
    console.error("[ORDER] Buyer email exception (non-critical):", e);
  }

  return result;
}
