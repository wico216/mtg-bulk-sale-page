import { NextRequest, NextResponse } from "next/server";
import { buildDeckCheckResult } from "@/lib/deck-check";
import { e2eFixturesEnabled } from "@/lib/e2e-fixtures";
import { loadStorefrontData } from "@/lib/storefront-data";

export const dynamic = "force-dynamic";

interface DeckCheckBody {
  input?: unknown;
}

export async function POST(request: NextRequest) {
  let body: DeckCheckBody;
  try {
    body = (await request.json()) as DeckCheckBody;
  } catch {
    return NextResponse.json({ error: "Send JSON with an input field." }, { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json({ error: "Paste a deck link or exported decklist first." }, { status: 400 });
  }
  if (input.length > 60_000) {
    return NextResponse.json({ error: "Deck input is too large. Try exporting a cleaner list." }, { status: 413 });
  }

  try {
    const data = await loadStorefrontData();
    const result = await buildDeckCheckResult(input, data.cards, {
      resolveIdentities: !e2eFixturesEnabled(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check that deck.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
