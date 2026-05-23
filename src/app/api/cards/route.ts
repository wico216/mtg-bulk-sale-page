import { getCardsAggregated } from "@/db/queries";
import {
  STOREFRONT_PAGE_SIZE,
  paginateStorefrontCards,
  queryFromSearchParams,
  stripAdminFields,
} from "@/lib/storefront";
import { logError } from "@/lib/logger";

const ROUTE = "/api/cards";

function toBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = queryFromSearchParams(url.searchParams);
  const offset = toBoundedInt(url.searchParams.get("offset"), 0, 0, 1_000_000);
  const limit = toBoundedInt(
    url.searchParams.get("limit"),
    STOREFRONT_PAGE_SIZE,
    1,
    96,
  );

  try {
    const cards = stripAdminFields(await getCardsAggregated());
    const page = paginateStorefrontCards(cards, query, offset, limit);
    return Response.json(page, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError({
      event: "storefront.cards.failed",
      route: ROUTE,
      error,
      metadata: { offset, limit },
    });
    return Response.json(
      { error: "Failed to load cards" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
