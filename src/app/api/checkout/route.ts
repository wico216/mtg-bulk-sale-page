import { NextRequest } from "next/server";
import { placeCheckoutOrder } from "@/db/orders";
import { generateOrderRef } from "@/lib/order";
import { notifyOrder, type NotifyResult } from "@/lib/notifications";
import type { CheckoutRequest, CheckoutResponse } from "@/lib/types";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCheckoutRequest(body: CheckoutRequest): string | null {
  if (!body.buyerName || typeof body.buyerName !== "string" || !body.buyerName.trim()) {
    return "Name is required";
  }

  if (!body.buyerEmail || !emailRegex.test(body.buyerEmail)) {
    return "Valid email is required";
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return "Cart is empty";
  }

  for (const item of body.items) {
    if (
      !item ||
      typeof item.cardId !== "string" ||
      item.cardId.trim() === "" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return "Invalid cart item";
    }
  }

  return null;
}

async function notifyOrderAfterCommit(order: CheckoutResponse["order"]): Promise<NotifyResult> {
  try {
    return await notifyOrder(order);
  } catch (error) {
    console.error("[CHECKOUT] Notification failed after order commit:", error);
    return { sellerEmailSent: false, buyerEmailSent: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutRequest;
    const validationError = validateCheckoutRequest(body);
    if (validationError) {
      return Response.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    let checkoutResult;
    try {
      checkoutResult = await placeCheckoutOrder({
        orderRef: generateOrderRef(),
        buyerName: body.buyerName.trim(),
        buyerEmail: body.buyerEmail.trim(),
        message: body.message?.trim() || undefined,
        items: body.items.map((item) => ({
          cardId: item.cardId,
          quantity: item.quantity,
        })),
      });
    } catch (dbError) {
      console.error("[CHECKOUT] Database error:", dbError);
      return Response.json(
        { success: false, error: "Unable to process order right now, please try again" },
        { status: 503 },
      );
    }

    if (!checkoutResult.ok) {
      return Response.json(
        {
          success: false,
          code: "stock_conflict",
          error: "Some cards are no longer available.",
          conflicts: checkoutResult.conflicts,
        },
        { status: 409 },
      );
    }

    const notification = await notifyOrderAfterCommit(checkoutResult.order);

    const response: CheckoutResponse = {
      success: true,
      orderRef: checkoutResult.order.orderRef,
      order: checkoutResult.order,
      notification,
    };
    return Response.json(response, { status: 201 });
  } catch (error) {
    console.error("[CHECKOUT] Unexpected error:", error);
    return Response.json(
      { success: false, error: "Something went wrong. Your order was not placed." },
      { status: 500 },
    );
  }
}
