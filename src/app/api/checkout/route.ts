import { NextRequest } from "next/server";
import { placeCheckoutOrder } from "@/db/orders";
import { generateOrderRef } from "@/lib/order";
import { notifyOrder, type NotifyResult } from "@/lib/notifications";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";
import type {
  CheckoutRequest,
  CheckoutResponse,
  OrderData,
} from "@/lib/types";

const ROUTE = "/api/checkout";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 18 D-08: Detects the Postgres `cards_quantity_check` CHECK
 * constraint violation. The constraint is the schema-level safety net
 * (Phase 16 BIND-04) that guards against a logic bug ever leading to
 * `cards.quantity < 0`. If the allocator's per-binder running-supply
 * arithmetic is correct, this should never fire — but if it does, we
 * surface it as HTTP 503 (transient/retry-safe) instead of a silent
 * oversell, and emit a structured log event so operators can spot it.
 *
 * Postgres error code 23514 = `check_violation`. neon-http surfaces the
 * error as an object with `code` and `constraint` fields per node-postgres
 * convention.
 */
function isCheckConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; constraint?: string };
  return err.code === "23514" && err.constraint === "cards_quantity_check";
}

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

async function notifyOrderAfterCommit(order: OrderData): Promise<NotifyResult> {
  try {
    return await notifyOrder(order);
  } catch (error) {
    logError({
      event: "checkout.notification_failed",
      route: ROUTE,
      error,
      metadata: { orderRef: order.orderRef, totalItems: order.totalItems },
    });
    return { sellerEmailSent: false, buyerEmailSent: false };
  }
}

export async function POST(request: NextRequest) {
  // Rate-limit BEFORE parsing the body. This protects the JSON parse cost and
  // the DB call from abusive repeat callers (D-02). Public surface -> per-IP key.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request),
    config: RATE_LIMIT_BUCKETS.CHECKOUT,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "checkout.rate_limited",
      route: ROUTE,
    });
    return rateLimited;
  }

  try {
    const body = (await request.json()) as CheckoutRequest;
    const validationError = validateCheckoutRequest(body);
    if (validationError) {
      logEvent({
        level: "warn",
        event: "checkout.validation_failed",
        route: ROUTE,
        metadata: { reason: validationError, itemCount: Array.isArray(body?.items) ? body.items.length : 0 },
      });
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
      // Phase 18 D-08: detect the schema-level safety-net trip explicitly.
      // The cards_quantity_check CHECK constraint should NEVER fire if the
      // allocator's per-binder allocation math is correct; if it does,
      // surface HTTP 503 with a distinguishable error code so retries are
      // safe and operators can grep logs for the (should-never-happen)
      // event.
      if (isCheckConstraintError(dbError)) {
        logError({
          event: "checkout.check_constraint_violation",
          route: ROUTE,
          error: dbError,
          metadata: { itemCount: body.items.length },
        });
        return Response.json(
          {
            success: false,
            error: "Inventory check failed — please refresh and try again",
            code: "stock_check_violation",
          },
          { status: 503 },
        );
      }
      logError({
        event: "checkout.db_failed",
        route: ROUTE,
        error: dbError,
        metadata: { itemCount: body.items.length },
      });
      return Response.json(
        { success: false, error: "Unable to process order right now, please try again" },
        { status: 503 },
      );
    }

    if (!checkoutResult.ok) {
      logEvent({
        level: "warn",
        event: "checkout.stock_conflict",
        route: ROUTE,
        metadata: { conflictCount: checkoutResult.conflicts.length },
      });
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

    // Phase 18 D-13: pick complexity signal — count of distinct binder
    // sources for this order. Bounded, no PII, no per-binder breakdown.
    // Operators can log-aggregate to spot orders with high binder spread
    // (operator pull-friction signal). Per-line binder is in
    // order_items.binder snapshot for Phase 21's admin order detail; we
    // explicitly avoid duplicating it in audit metadata (D-12 — 4KB cap).
    const binderSourceCount = new Set(
      checkoutResult.order.items.map((item) => item.binder),
    ).size;
    logEvent({
      level: "info",
      event: "checkout.order_committed",
      route: ROUTE,
      metadata: {
        orderRef: checkoutResult.order.orderRef,
        totalItems: checkoutResult.order.totalItems,
        totalPrice: checkoutResult.order.totalPrice,
        binderSourceCount,
      },
    });

    const notification = await notifyOrderAfterCommit(checkoutResult.order);

    if (!notification.sellerEmailSent || !notification.buyerEmailSent) {
      logEvent({
        level: "warn",
        event: "checkout.notification_partial",
        route: ROUTE,
        metadata: {
          orderRef: checkoutResult.order.orderRef,
          sellerEmailSent: notification.sellerEmailSent,
          buyerEmailSent: notification.buyerEmailSent,
        },
      });
    }

    const response: CheckoutResponse = {
      success: true,
      orderRef: checkoutResult.order.orderRef,
      order: checkoutResult.order,
      notification,
    };
    return Response.json(response, { status: 201 });
  } catch (error) {
    logError({
      event: "checkout.unexpected_error",
      route: ROUTE,
      error,
    });
    return Response.json(
      { success: false, error: "Something went wrong. Your order was not placed." },
      { status: 500 },
    );
  }
}
