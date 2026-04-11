import { NextRequest } from "next/server";
import { getCards } from "@/db/queries";
import { buildOrderData } from "@/lib/order";
import { notifyOrder } from "@/lib/notifications";
import type { Card, CheckoutRequest, CheckoutResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutRequest;

    // Validate required fields
    if (!body.buyerName || typeof body.buyerName !== "string" || !body.buyerName.trim()) {
      return Response.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    // D-09: server-side basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!body.buyerEmail || !emailRegex.test(body.buyerEmail)) {
      return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ success: false, error: "Cart is empty" }, { status: 400 });
    }

    // Validate env vars
    if (!process.env.RESEND_API_KEY) {
      console.error("[CHECKOUT] RESEND_API_KEY not configured");
      return Response.json({ success: false, error: "Server configuration error" }, { status: 500 });
    }
    if (!process.env.SELLER_EMAIL) {
      console.error("[CHECKOUT] SELLER_EMAIL not configured");
      return Response.json({ success: false, error: "Server configuration error" }, { status: 500 });
    }

    // Load card data from database for stock validation (D-08) and order building
    let cards: Card[];
    try {
      cards = await getCards();
    } catch (dbError) {
      console.error("[CHECKOUT] Database error:", dbError);
      return Response.json(
        { success: false, error: "Unable to process order right now, please try again" },
        { status: 503 },
      );
    }
    const cardMap = new Map(cards.map((c) => [c.id, c]));

    // Validate stock (D-08): check each item exists and requested qty <= available
    const stockErrors: string[] = [];
    for (const item of body.items) {
      const card = cardMap.get(item.cardId);
      if (!card) {
        stockErrors.push(`Card "${item.cardId}" not found in inventory`);
      } else if (item.quantity > card.quantity) {
        stockErrors.push(`"${card.name}" only has ${card.quantity} available (requested ${item.quantity})`);
      } else if (item.quantity <= 0) {
        stockErrors.push(`Invalid quantity for "${item.cardId}"`);
      }
    }
    if (stockErrors.length > 0) {
      return Response.json({ success: false, error: stockErrors.join("; ") }, { status: 400 });
    }

    // Build order data (D-14: clean separation)
    const orderData = buildOrderData(body, cards);

    // Send notifications (D-17: seller priority, buyer best-effort)
    const notifyResult = await notifyOrder(orderData);

    if (!notifyResult.sellerEmailSent) {
      // Seller email failed -- treat as order failure
      return Response.json(
        { success: false, error: "Something went wrong. Your order was not placed." },
        { status: 500 },
      );
    }

    // Success (even if buyer email failed per D-17)
    const response: CheckoutResponse = {
      success: true,
      orderRef: orderData.orderRef,
      order: orderData,
    };
    return Response.json(response);
  } catch (error) {
    console.error("[CHECKOUT] Unexpected error:", error);
    return Response.json(
      { success: false, error: "Something went wrong. Your order was not placed." },
      { status: 500 },
    );
  }
}
